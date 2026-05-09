export const maxDuration = 300; // 5 min for OCR inference

/**
 * POST /api/line/sandbox
 *
 * Sandbox endpoint for testing the AI pipeline without LINE webhook.
 *
 * Request types:
 *   { type: 'text', text: 'ซื้อข้าว 85 บาท', userId: '<id>' }  — auto-detect intent
 *   { type: 'image', imageBase64: '<base64>', userId: '<id>' }   — create from slip
 *   { type: 'query', query: 'ดูยอด', userId: '<id>' }          — direct query
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractFromText,
  extractFromSlip,
  formatConfirmationMessage,
  formatErrorMessage,
  detectIntent,
  formatQuickReply,
  QUICK_REPLY_ITEMS,
  type ExtractedTransaction,
} from '@/lib/ollama';

// ── Request Types ──────────────────────────────────────────────

interface SandboxTextRequest {
  type: 'text';
  text: string;
  userId: string;
}

interface SandboxImageRequest {
  type: 'image';
  imageBase64: string;
  userId: string;
}

interface SandboxQueryRequest {
  type: 'query';
  query: string;
  userId: string;
}

type SandboxRequest = SandboxTextRequest | SandboxImageRequest | SandboxQueryRequest;

// ── Helpers ────────────────────────────────────────────────────

function getDataScope(user: { id: string; role: string; familyId: string }) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

async function findDefaultAccount(userId: string) {
  return prisma.account.findFirst({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

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

// ── Query Handler ─────────────────────────────────────────────

type QueryIntent = 'balance' | 'recent' | 'summary';

function detectQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  if (/(ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|balance)/i.test(q)) return 'balance';
  if (/(รายการล่าสุด|ล่าสุด|รายการวันนี้|วันนี้|recent|last)/i.test(q)) return 'recent';
  if (/(สรุป|สรุปยอด|รวม|รวมรายจ่าย|รวมรายรับ|summary|total)/i.test(q)) return 'summary';

  return 'recent'; // default to recent
}

async function handleQuery(user: { id: string; name: string; role: string; familyId: string }, intent: QueryIntent) {
  const scope = getDataScope(user);
  const fmt = new Intl.NumberFormat('th-TH');

  if (intent === 'balance') {
    const accounts = await prisma.account.findMany({
      where: { ownerId: user.id, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });

    if (accounts.length === 0) {
      return { reply: 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน', data: null };
    }

    const lines = accounts.map((a) => `💳 ${a.name}: ${fmt.format(Number(a.balance))} บาท`);
    const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    lines.push(`\n💰 รวมทุกบัญชี: ${fmt.format(total)} บาท`);

    return { reply: `📊 ยอดคงเหลือ\n${lines.join('\n')}`, data: { accounts, total } };
  }

  if (intent === 'recent') {
    const transactions = await prisma.transaction.findMany({
      where: scope,
      include: { category: { include: { group: true } }, account: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (transactions.length === 0) {
      return { reply: 'ยังไม่มีรายการ', data: null };
    }

    const lines = transactions.map((t) => {
      const icon = t.type === 'income' ? '🟢' : t.type === 'transfer' ? '🔄' : '🔴';
      const typeLabel = t.type === 'income' ? '+' : '-';
      return `${icon} ${t.description || 'ไม่ระบุ'} ${typeLabel}${fmt.format(Number(t.amount))} บาท (${t.category?.group?.name ?? '-'})`;
    });

    return { reply: `📋 รายการล่าสุด (${transactions.length} รายการ)\n${lines.join('\n')}`, data: transactions };
  }

  if (intent === 'summary') {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [income, expense] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...scope, type: 'income', date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);
    const monthName = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    return {
      reply: `📊 สรุปยอดเดือน${monthName}\n🟢 รายรับ: ${fmt.format(totalIncome)} บาท\n🔴 รายจ่าย: ${fmt.format(totalExpense)} บาท\n💰 คงเหลือ: ${fmt.format(totalIncome - totalExpense)} บาท`,
      data: { totalIncome, totalExpense },
    };
  }

  return { reply: 'ไม่สามารถประมวลผลคำสั่งได้', data: null };
}

// ── Transaction Creation ────────────────────────────────────────

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

// ── POST Handler ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: SandboxRequest = await request.json();

    if (!body.type || !body.userId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, userId' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, role: true, familyId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.log(`[sandbox] user ${user.name} (${user.role}) type=${body.type}`);

    // ── Query: direct query from Quick Reply or explicit type ──
    if (body.type === 'query') {
      if (!('query' in body) || !body.query) {
        return NextResponse.json(
          { error: 'Missing query field for query type' },
          { status: 400 },
        );
      }

      const intent = detectQueryIntent(body.query);
      const { reply, data } = await handleQuery(user, intent);

      return NextResponse.json({
        success: true,
        intent,
        lineReplySent: reply,
        quickReply: formatQuickReply(QUICK_REPLY_ITEMS),
        data,
      });
    }

    // ── Validate create-type requests ──
    if (body.type !== 'text' && body.type !== 'image') {
      return NextResponse.json(
        { error: 'Invalid type. Use "text", "image", or "query".' },
        { status: 400 },
      );
    }

    // ── Text: detect intent first ──
    if (body.type === 'text') {
      if (!body.text) {
        return NextResponse.json(
          { error: 'Missing text field for text type' },
          { status: 400 },
        );
      }

      const intent = await detectIntent(body.text);
      console.log(`[sandbox] intent: ${intent} for text: "${body.text.slice(0, 50)}"`);

      // Route to query handler for non-transaction intents
      if (intent === 'balance' || intent === 'recent' || intent === 'summary') {
        const { reply, data } = await handleQuery(user, intent);
        return NextResponse.json({
          success: true,
          intent,
          lineReplySent: reply,
          quickReply: formatQuickReply(QUICK_REPLY_ITEMS),
          data,
        });
      }

      if (intent === 'help') {
        const helpText = `🤖 MyFam Bot ช่วยอะไรได้บ้าง:\n\n📝 บันทึกรายการ — พิมพ์ เช่น "ซื้อข้าว 85 บาท"\n📸 อ่านสลิป — ส่งรูปสลิป/ใบเสร็จ\n📊 ดูยอด — พิมพ์ "ดูยอด"\n📋 รายการล่าสุด — พิมพ์ "รายการล่าสุด"\n📈 สรุปยอด — พิมพ์ "สรุปยอด"`;
        return NextResponse.json({
          success: true,
          intent: 'help',
          lineReplySent: helpText,
          quickReply: formatQuickReply(QUICK_REPLY_ITEMS),
        });
      }

      // intent === 'create_transaction' — fall through to extraction
    }

    // ── Fetch categories ──
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = categories.map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
      groupType: c.group.type,
    }));

    let extracted: ExtractedTransaction;

    if (body.type === 'text') {
      extracted = await extractFromText(body.text, categoryContext);
    } else {
      if (!body.imageBase64) {
        return NextResponse.json(
          { error: 'Missing imageBase64 field for image type' },
          { status: 400 },
        );
      }
      extracted = await extractFromSlip(body.imageBase64, categoryContext);
    }

    if (extracted.amount === 0 && extracted.confidence < 0.3) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract transaction data. Please provide more details.',
        extracted,
      });
    }

    const scope = getDataScope(user);
    const transaction = await createTransactionFromExtracted(extracted, user);
    const replyText = formatConfirmationMessage(transaction, extracted);

    return NextResponse.json({
      success: true,
      intent: 'create_transaction',
      parsed: extracted,
      transaction: {
        id: transaction.id,
        amount: Number(transaction.amount),
        type: transaction.type,
        description: transaction.description,
        date: transaction.date,
        category: transaction.category?.name ?? null,
        categoryGroup: transaction.category?.group?.name ?? null,
        account: transaction.account?.name ?? 'Unknown',
      },
      lineReplySent: replyText,
      quickReply: formatQuickReply(QUICK_REPLY_ITEMS),
      scope,
    });
  } catch (error) {
    console.error('Sandbox error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const thaiMessage = formatErrorMessage(message);

    return NextResponse.json(
      { success: false, error: message, thaiMessage },
      { status: 500 },
    );
  }
}