/**
 * POST /api/line/webhook
 *
 * LINE Messaging API webhook handler.
 * Receives events from LINE, verifies signature, processes messages,
 * and replies to users.
 *
 * Key behaviors:
 * - Verifies X-Line-Signature header for security
 * - Processes one event at a time (single-item operations)
 * - Resolves LINE userId to MyFam user via LineLink table
 * - Enforces role-based access (child: own data only, parent: all family data)
 * - Returns 200 quickly to LINE, processes async
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLineSignature } from '@/lib/line-verify';
import { sendLineReply, downloadLineImage } from '@/lib/line';
import { extractFromText, extractFromSlip, formatConfirmationMessage, formatErrorMessage, type ExtractedTransaction } from '@/lib/ollama';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: {
    userId?: string;
    type?: string;
  };
  message?: {
    type?: string;
    text?: string;
    id?: string;
  };
}

interface LineWebhookBody {
  events: LineEvent[];
}

/**
 * Get data scope based on user role.
 * Single-item access only.
 */
function getDataScope(user: { id: string; role: string; familyId: string }) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

/**
 * Find user's default account (first active account).
 */
async function findDefaultAccount(userId: string) {
  return prisma.account.findFirst({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Fetch categories for user's family.
 */
async function getCategoriesForFamily(familyId: string) {
  const users = await prisma.user.findMany({
    where: { familyId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  return prisma.category.findMany({
    where: {
      OR: [
        { userId: null },
        { userId: { in: userIds } },
      ],
    },
    include: { group: true },
  });
}

/**
 * Create a single transaction from extracted data.
 * Follows the same pattern as POST /api/transactions.
 */
async function createTransactionFromExtracted(
  extracted: ExtractedTransaction,
  user: { id: string; role: string; familyId: string },
) {
  const account = await findDefaultAccount(user.id);
  if (!account) {
    throw new Error('User has no active account');
  }

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        amount: extracted.amount,
        date: new Date(extracted.date),
        type: extracted.type,
        description: extracted.description,
        status: 'completed',
        accountId: account.id,
        categoryId: extracted.categoryId,
        createdById: user.id,
        tags: ['line-bot'],
        fee: 0,
      },
      include: {
        category: { include: { group: true } },
        account: true,
        toAccount: true,
      },
    });

    const amount = extracted.amount;
    if (extracted.type === 'income') {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: amount } },
      });
    } else {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: amount } },
      });
    }

    return transaction;
  });
}

/**
 * Handle a single LINE event.
 * Processes one event at a time — no batch operations.
 */
async function handleLineEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message' || !event.source?.userId || !event.message) {
    return;
  }

  const lineUserId = event.source.userId;
  const replyToken = event.replyToken;
  if (!replyToken) return;

  // Resolve MyFam user from LINE userId (1:1 mapping)
  const link = await prisma.lineLink.findUnique({
    where: { lineUserId },
    include: { user: true },
  });

  if (!link) {
    await sendLineReply(
      replyToken,
      'ยังไม่ได้เชื่อมบัญชี MyFam\n\nกรุณาพิมพ์ "ลิงก์ <ชื่อผู้ใช้>" เพื่อเชื่อมต่อ\nเช่น "ลิงก์ พ่อ"',
    );
    return;
  }

  const user = link.user;

  // Handle link command
  if (event.message.type === 'text') {
    const text = event.message.text?.trim() || '';

    // Check for unlink command
    if (text === 'ยกเลิกลิงก์' || text.toLowerCase() === 'unlink') {
      await prisma.lineLink.delete({ where: { id: link.id } });
      await sendLineReply(replyToken, 'ยกเลิกการเชื่อมต่อเรียบร้อยแล้ว');
      return;
    }

    // Check for balance command
    if (text === 'ดูยอด' || text === 'ยอด' || text === 'balance') {
      await handleBalanceQuery(replyToken, user);
      return;
    }

    // Check for delete last transaction
    if (text === 'ลบรายการล่าสุด' || text === 'ลบล่าสุด') {
      await handleDeleteLast(replyToken, user);
      return;
    }

    // Extract transaction from text
    await handleTextMessage(replyToken, text, user);
    return;
  }

  // Handle image message (slip/receipt)
  if (event.message.type === 'image' && event.message.id) {
    await handleImageMessage(replyToken, event.message.id, user);
    return;
  }
}

/**
 * Handle text message: extract transaction data and create record.
 * Single item only.
 */
async function handleTextMessage(
  replyToken: string,
  text: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  try {
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = categories.map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
      groupType: c.group.type,
    }));

    const extracted = await extractFromText(text, categoryContext);

    if (extracted.amount === 0 && extracted.confidence < 0.3) {
      await sendLineReply(
        replyToken,
        'ไม่พบจำนวนเงินในข้อความ\nกรุณาระบุจำนวนเงิน เช่น "ซื้อข้าว 85 บาท"',
      );
      return;
    }

    const transaction = await createTransactionFromExtracted(extracted, user);
    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLineReply(replyToken, replyText);
  } catch (error) {
    console.error('Text processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLineReply(replyToken, formatErrorMessage(message));
  }
}

/**
 * Handle image message: download, OCR, extract, create transaction.
 * Single item only.
 */
async function handleImageMessage(
  replyToken: string,
  messageId: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  try {
    // Download image from LINE (auto-deleted, must download promptly)
    const imageBuffer = await downloadLineImage(messageId);
    const imageBase64 = imageBuffer.toString('base64');

    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = categories.map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
      groupType: c.group.type,
    }));

    const extracted = await extractFromSlip(imageBase64, categoryContext);

    if (extracted.amount === 0 && extracted.confidence < 0.3) {
      await sendLineReply(
        replyToken,
        'ไม่สามารถอ่านสลิปได้ กรุณาส่งรูปที่ชัดกว่านี้ หรือพิมพ์รายละเอียดแทน',
      );
      return;
    }

    const transaction = await createTransactionFromExtracted(extracted, user);

    // Save slip image to transaction
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { slipImage: `data:image/jpeg;base64,${imageBase64}` },
    });

    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLineReply(replyToken, replyText);
  } catch (error) {
    console.error('Image processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLineReply(replyToken, formatErrorMessage(message));
  }
}

/**
 * Handle balance query: show user's account balances.
 * Child sees own accounts only, parent sees all family accounts.
 */
async function handleBalanceQuery(
  replyToken: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  const scope = user.role === 'parent'
    ? { owner: { familyId: user.familyId } }
    : { ownerId: user.id };

  const accounts = await prisma.account.findMany({
    where: { ...scope, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    await sendLineReply(replyToken, 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน');
    return;
  }

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  let msg = `💰 ยอดคงเหลือ\n\n`;

  for (const account of accounts) {
    const balance = new Intl.NumberFormat('th-TH').format(Number(account.balance));
    msg += `${account.name}: ${balance} บาท\n`;
  }

  msg += `\n💵 รวม: ${new Intl.NumberFormat('th-TH').format(totalBalance)} บาท`;
  await sendLineReply(replyToken, msg);
}

/**
 * Delete the last transaction created by the user.
 * Child: can only delete own. Parent: can delete any in family.
 * Single item only.
 */
async function handleDeleteLast(
  replyToken: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  const scope = user.role === 'parent'
    ? { createdBy: { familyId: user.familyId } }
    : { createdById: user.id };

  const lastTransaction = await prisma.transaction.findFirst({
    where: { ...scope, tags: { has: 'line-bot' } },
    orderBy: { createdAt: 'desc' },
    include: { account: true },
  });

  if (!lastTransaction) {
    await sendLineReply(replyToken, 'ไม่พบรายการที่สร้างผ่าน LINE');
    return;
  }

  // Revert balance and delete (same pattern as DELETE /api/transactions/[id])
  const amount = Number(lastTransaction.amount);

  await prisma.$transaction(async (tx) => {
    if (lastTransaction.type === 'income') {
      await tx.account.update({
        where: { id: lastTransaction.accountId! },
        data: { balance: { decrement: amount } },
      });
    } else {
      await tx.account.update({
        where: { id: lastTransaction.accountId! },
        data: { balance: { increment: amount } },
      });
    }

    await tx.transaction.delete({
      where: { id: lastTransaction.id },
    });
  });

  const formattedAmount = new Intl.NumberFormat('th-TH').format(amount);
  await sendLineReply(
    replyToken,
    `🗑️ ลบรายการแล้ว\n${lastTransaction.description || '-'} ${formattedAmount} บาท`,
  );
}

export async function POST(request: Request) {
  try {
    // 1. Verify LINE signature
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      console.error('LINE_CHANNEL_SECRET not configured');
      return NextResponse.json({ error: 'LINE not configured' }, { status: 500 });
    }

    const signature = request.headers.get('x-line-signature');
    const rawBody = await request.text();

    if (!verifyLineSignature(rawBody, signature, channelSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // 2. Parse webhook body
    const body: LineWebhookBody = JSON.parse(rawBody);

    // 3. Process each event independently (single-item operations)
    // Return 200 quickly to LINE, process events sequentially
    const results = await Promise.allSettled(
      (body.events || []).map((event) => handleLineEvent(event)),
    );

    // Log any failures but don't fail the webhook
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Event processing failed:', result.reason);
      }
    }

    return NextResponse.json({ processed: (body.events || []).length });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}