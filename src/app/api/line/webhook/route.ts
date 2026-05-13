/**
 * POST /api/line/webhook
 *
 * LINE Messaging API webhook handler.
 *
 * Flow: reply "processing" immediately → process AI → push result.
 * Reply tokens expire in 30s, so we acknowledge fast and push later.
 *
 * Quick Reply actions handled as text commands:
 * - ดูยอด / รายการล่าสุด / สรุปยอด / ช่วยเหลือ
 * - ยืนยันรายจ่าย / ยืนยันรายรับ / ยกเลิก
 * - เลือกหมวด:{groupId} / เลือกประเภท:{categoryId} / ข้ามหมวด / ข้ามประเภท
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLineSignature } from '@/lib/line-verify';
import { sendLineReply, sendLinePush, downloadLineImage } from '@/lib/line';
import {
  extractFromText,
  extractFromSlip,
  formatConfirmationMessage,
  formatErrorMessage,
  detectIntent,
  formatQuickReply,
  QUICK_REPLY_ITEMS,
  CONFIRM_TYPE_ITEMS,
  buildCategoryGroupReply,
  buildSubcategoryReply,
  type ExtractedTransaction,
} from '@/lib/ollama';
import { buildMonthlySummaryFlex, buildBudgetProgressFlex } from '@/lib/chart-message';
import { sendLineFlexReply } from '@/lib/line';

export const maxDuration = 300;

// ── Types ──────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────

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

function getCategoryContext(categories: Awaited<ReturnType<typeof getCategoriesForFamily>>) {
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: c.group.name,
    groupType: c.group.type,
  }));
}

// ── Quick Reply Shorthand ──────────────────────────────────────

const menuQuickReply = formatQuickReply(QUICK_REPLY_ITEMS);

// ── Command Detection ───────────────────────────────────────────

type CommandType =
  | 'open_liff'
  | 'summary'
  | 'help'
  | 'balance'
  | 'recent'
  | 'budget'
  | 'confirm_expense'
  | 'confirm_income'
  | 'cancel'
  | 'link'
  | 'unlink'
  | 'delete_last'
  | 'select_group'
  | 'select_subcategory'
  | 'skip_group'
  | 'skip_subcategory'
  | 'none';

function detectCommand(text: string): CommandType {
  const q = text.trim();

  // Exact match for Quick Reply action texts
  if (q === 'ยืนยันรายจ่าย') return 'confirm_expense';
  if (q === 'ยืนยันรายรับ') return 'confirm_income';
  if (q === 'ยกเลิก') return 'cancel';
  if (q.startsWith('เลือกหมวด:')) return 'select_group';
  if (q.startsWith('เลือกประเภท:')) return 'select_subcategory';
  if (q === 'ข้ามหมวด') return 'skip_group';
  if (q === 'ข้ามประเภท') return 'skip_subcategory';

  // Fuzzy match for user-typed commands (handles typos and variations)
  if (/เปิด MyFam|เปิดแอป|open app/i.test(q)) return 'open_liff';
  if (/ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|ยอด|balance/i.test(q)) return 'balance';
  if (/รายการล่าสุด|ล่าสุด|รายการวันนี้|recent/i.test(q)) return 'recent';
  if (/สรุปยอด|สรุปยอด|รวมรายจ่าย|รวมรายรับ|สรุป|summary/i.test(q)) return 'summary';
  if (/ช่วยเหลือ|ช่วย|ใช้ยังไง|ทำอะไรได้|help|บอททำอะไร/i.test(q)) return 'help';
  if (/^ลิงก์|^link/i.test(q)) return 'link';
  if (/ยกเลิกลิงก์|unlink/i.test(q)) return 'unlink';
  if (/ลบรายการล่าสุด|ลบล่าสุด|ลบรายการ/i.test(q)) return 'delete_last';
  if (/^งบ$|งบประมาณ|budget/i.test(q)) return 'budget';

  return 'none';
}

// ── Query Handlers ──────────────────────────────────────────────

async function handleBalanceQuery(user: { id: string; role: string; familyId: string }): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: { ownerId: user.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    return 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน';
  }

  const fmt = new Intl.NumberFormat('th-TH');
  const lines = accounts.map((a) => `💳 ${a.name}: ${fmt.format(Number(a.balance))} บาท`);
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  lines.push(`\n💰 รวมทุกบัญชี: ${fmt.format(total)} บาท`);

  return `📊 ยอดคงเหลือ\n${lines.join('\n')}`;
}

async function handleRecentQuery(user: { id: string; role: string; familyId: string }): Promise<string> {
  const scope = getDataScope(user);
  const transactions = await prisma.transaction.findMany({
    where: scope,
    include: { category: { include: { group: true } }, account: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (transactions.length === 0) {
    return 'ยังไม่มีรายการ';
  }

  const fmt = new Intl.NumberFormat('th-TH');
  const lines = transactions.map((t) => {
    const icon = t.type === 'income' ? '🟢' : t.type === 'transfer' ? '🔄' : '🔴';
    const typeLabel = t.type === 'income' ? '+' : '-';
    return `${icon} ${t.description || 'ไม่ระบุ'} ${typeLabel}${fmt.format(Number(t.amount))} บาท (${t.category?.group?.name ?? '-'})`;
  });

  return `📋 รายการล่าสุด (${transactions.length} รายการ)\n${lines.join('\n')}`;
}

async function handleSummaryQuery(user: { id: string; role: string; familyId: string }): Promise<string> {
  const scope = getDataScope(user);
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = new Intl.NumberFormat('th-TH');

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

  return `📊 สรุปยอดเดือน${monthName}\n🟢 รายรับ: ${fmt.format(totalIncome)} บาท\n🔴 รายจ่าย: ${fmt.format(totalExpense)} บาท\n💰 คงเหลือ: ${fmt.format(totalIncome - totalExpense)} บาท`;
}

async function handleSummaryFlex(
  replyToken: string,
  user: { id: string; role: string; familyId: string },
): Promise<void> {
  const scope = getDataScope(user);
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthName = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const [income, expense, topCategories] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...scope, type: 'income', date: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
      include: { category: { include: { group: true } } },
      orderBy: { amount: 'desc' },
      take: 10,
    }),
  ]);

  const totalIncome = Number(income._sum.amount ?? 0);
  const totalExpense = Number(expense._sum.amount ?? 0);

  // Aggregate top categories
  const catMap = new Map<string, number>();
  for (const tx of topCategories) {
    const name = tx.category?.group?.name || tx.category?.name || 'อื่นๆ';
    catMap.set(name, (catMap.get(name) || 0) + Number(tx.amount));
  }
  const topCats = Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const flex = buildMonthlySummaryFlex({
    monthName,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    topCategories: topCats,
  });

  await sendLineFlexReply(replyToken, `สรุปยอดเดือน${monthName}`, flex);
}

async function handleBudgetFlex(
  replyToken: string,
  user: { id: string; role: string; familyId: string },
): Promise<void> {
  const familyBudgets = await prisma.budget.findMany({
    where: { createdBy: { familyId: user.familyId } },
    include: { transactions: { where: { status: 'completed' } } },
  });

  const budgetData = familyBudgets.map((b) => {
    const totalActual = b.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    return { title: b.title, used: totalActual, limit: Number(b.limit) };
  });

  const flex = buildBudgetProgressFlex(budgetData);
  await sendLineFlexReply(replyToken, 'งบประมาณ', flex);
}

// ── Transaction Creation ─────────────────────────────────────────

async function createTransactionFromExtracted(
  extracted: ExtractedTransaction,
  user: { id: string; role: string; familyId: string },
  status: 'completed' | 'pending' = 'completed',
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
        status,
        accountId: account.id,
        categoryId: extracted.categoryId,
        createdById: user.id,
        fee: 0,
        tagRecords: {
          create: [{ tag: { connectOrCreate: { create: { name: 'line-bot', userId: user.id, familyId: user.familyId }, where: { name_userId: { name: 'line-bot', userId: user.id } } } } }],
        },
      },
      include: {
        category: { include: { group: true } },
        account: true,
        toAccount: true,
      },
    });

    if (status === 'completed') {
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
    }

    return transaction;
  });
}

// ── Confirm Pending Transaction ──────────────────────────────────

async function confirmPendingTransaction(
  user: { id: string; role: string; familyId: string },
  confirmedType: 'income' | 'expense',
): Promise<string> {
  const scope = getDataScope(user);

  const pending = await prisma.transaction.findFirst({
    where: { ...scope, status: 'pending', tagRecords: { some: { tag: { name: 'line-bot' } } } },
    orderBy: { createdAt: 'desc' },
    include: { category: { include: { group: true } } },
  });

  if (!pending) {
    return 'ไม่พบรายการที่รอการยืนยัน';
  }

  const categories = await getCategoriesForFamily(user.familyId);
  const categoryContext = getCategoryContext(categories);

  // Re-match category with the confirmed type
  const extracted: ExtractedTransaction = {
    amount: Number(pending.amount),
    date: pending.date.toISOString().split('T')[0],
    description: pending.description || '',
    type: confirmedType,
    categoryId: pending.categoryId,
    categoryGroupName: pending.category?.group?.name || '',
    confidence: 1,
    needsConfirmation: false,
  };

  // Find matching category for confirmed type
  let matchedCat = extracted.categoryGroupName
    ? categories.find(
        (c) => c.group.name === extracted.categoryGroupName && c.group.type === confirmedType,
      )
    : null;

  if (!matchedCat && extracted.categoryGroupName) {
    matchedCat = categories.find(
      (c) => c.name === extracted.categoryGroupName && c.group.type === confirmedType,
    );
  }

  if (!matchedCat) {
    matchedCat = categories.find((c) => c.group.type === confirmedType);
  }

  const categoryId = matchedCat?.id ?? pending.categoryId;

  // Update transaction: change type, status, and category
  const account = await findDefaultAccount(user.id);
  if (!account) {
    return 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน';
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: pending.id },
      data: {
        type: confirmedType,
        status: 'completed',
        categoryId,
      },
    });

    // Adjust balance
    const amount = Number(pending.amount);
    if (confirmedType === 'income') {
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
  });

  // Refetch for confirmation message
  const updated = await prisma.transaction.findUnique({
    where: { id: pending.id },
    include: { category: { include: { group: true } }, account: true },
  });

  if (matchedCat) {
    extracted.categoryId = matchedCat.id;
    extracted.categoryGroupName = matchedCat.group.name;
  }

  return formatConfirmationMessage(updated!, extracted);
}

// ── Cancel Pending Transaction ────────────────────────────────────

async function cancelPendingTransaction(
  user: { id: string; role: string; familyId: string },
): Promise<string> {
  const scope = getDataScope(user);

  const pending = await prisma.transaction.findFirst({
    where: { ...scope, status: 'pending', tagRecords: { some: { tag: { name: 'line-bot' } } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) {
    return 'ไม่พบรายการที่รอการยืนยัน';
  }

  await prisma.transaction.update({
    where: { id: pending.id },
    data: { status: 'void' },
  });

  return `❌ ยกเลิกรายการแล้ว\n📝 ${pending.description || 'ไม่ระบุ'} ${new Intl.NumberFormat('th-TH').format(Number(pending.amount))} บาท`;
}

// ── Category Selection ───────────────────────────────────────────

async function handleSelectGroup(
  groupId: string,
  user: { id: string; role: string; familyId: string },
): Promise<{ text: string; quickReply: ReturnType<typeof formatQuickReply> }> {
  // Find the most recent completed transaction from line-bot for this user
  const scope = getDataScope(user);
  const transaction = await prisma.transaction.findFirst({
    where: { ...scope, status: 'completed', tagRecords: { some: { tag: { name: 'line-bot' } } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!transaction) {
    return { text: 'ไม่พบรายการที่สร้างล่าสุด', quickReply: menuQuickReply };
  }

  // Get subcategories for the selected group
  const categories = await prisma.category.findMany({
    where: { groupId },
    orderBy: { name: 'asc' },
  });

  if (categories.length === 0) {
    return { text: 'ไม่พบหมวดหมู่ย่อย', quickReply: menuQuickReply };
  }

  const quickReply = buildSubcategoryReply(categories);
  return { text: `📂 เลือกหมวดหมู่ย่อย:`, quickReply };
}

async function handleSelectSubcategory(
  categoryId: string,
  user: { id: string; role: string; familyId: string },
): Promise<string> {
  const scope = getDataScope(user);

  const transaction = await prisma.transaction.findFirst({
    where: { ...scope, status: 'completed', tagRecords: { some: { tag: { name: 'line-bot' } } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!transaction) {
    return 'ไม่พบรายการที่สร้างล่าสุด';
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { group: true },
  });

  if (!category) {
    return 'ไม่พบหมวดหมู่';
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categoryId },
  });

  return `✅ อัปเดตหมวดหมู่เป็น "${category.name}" (${category.group.name}) แล้ว`;
}

// ── Delete Last Transaction ───────────────────────────────────────

async function handleDeleteLast(
  user: { id: string; role: string; familyId: string },
): Promise<string> {
  const scope = user.role === 'parent'
    ? { createdBy: { familyId: user.familyId } }
    : { createdById: user.id };

  const lastTransaction = await prisma.transaction.findFirst({
    where: { ...scope, tagRecords: { some: { tag: { name: 'line-bot' } } } },
    orderBy: { createdAt: 'desc' },
    include: { account: true },
  });

  if (!lastTransaction) {
    return 'ไม่พบรายการที่สร้างผ่าน LINE';
  }

  const amount = Number(lastTransaction.amount);

  // Only revert balance if transaction was completed
  if (lastTransaction.status === 'completed' && lastTransaction.accountId) {
    const accountId = lastTransaction.accountId;
    await prisma.$transaction(async (tx) => {
      if (lastTransaction.type === 'income') {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { decrement: amount } },
        });
      } else {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: amount } },
        });
      }

      await tx.transaction.delete({
        where: { id: lastTransaction.id },
      });
    });
  } else {
    await prisma.transaction.delete({
      where: { id: lastTransaction.id },
    });
  }

  const formattedAmount = new Intl.NumberFormat('th-TH').format(amount);
  return `🗑️ ลบรายการแล้ว\n${lastTransaction.description || '-'} ${formattedAmount} บาท`;
}

// ── Handle Link Command (deprecated — now guides to invite system) ──

async function handleLinkCommand(
  _text: string,
  replyToken: string,
  _lineUserId: string,
): Promise<void> {
  await sendLineReply(replyToken, `ยังไม่ได้เชื่อมบัญชี MyFam\n\n📌 กรุณาขอลิงก์เชื่อมต่อจากผู้ปกครอง\nผู้ปกครองสามารถสร้างลิงก์เชิญได้จาก\n⚙️ การตั้งค่า > สมาชิกครอบครัว ในแอป MyFam`);
}

// ── Event Handler ─────────────────────────────────────────────────

async function handleLineEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message' || !event.source?.userId) {
    return;
  }

  const lineUserId = event.source.userId;
  const replyToken = event.replyToken;
  if (!replyToken) return;

  // Resolve MyFam user from LINE userId
  const link = await prisma.lineLink.findUnique({
    where: { lineUserId },
    include: { user: true },
  });

  // ── Unlinked user commands ──
  if (!link) {
    if (event.message?.type === 'text') {
      const text = event.message.text?.trim() || '';
      const cmd = detectCommand(text);

      if (cmd === 'link') {
        await handleLinkCommand(text, replyToken, lineUserId);
        return;
      }

      if (cmd === 'help') {
        await sendLineReply(replyToken, `🤖 MyFam Bot\n\nพิมพ์หรือถามได้เลย:\n📝 บันทึกรายการ — "ซื้อข้าว 85"\n📸 ส่งรูปสลิป — บันทึกอัตโนมัติ\n🔗 เชื่อมบัญชี — ขอลิงก์จากผู้ปกครอง`, menuQuickReply);
        return;
      }
    }

    await sendLineReply(
      replyToken,
      'ยังไม่ได้เชื่อมบัญชี MyFam\n\n📌 กรุณาขอลิงก์เชื่อมต่อจากผู้ปกครอง\nผู้ปกครองสามารถสร้างลิงก์เชิญได้จาก\n⚙️ การตั้งค่า > สมาชิกครอบครัว ในแอป MyFam',
    );
    return;
  }

  const user = link.user;

  // ── Handle text messages ──
  if (event.message?.type === 'text') {
    const text = event.message.text?.trim() || '';
    await handleTextMessage(replyToken, lineUserId, text, user);
    return;
  }

  // ── Handle image messages (slip/receipt) ──
  if (event.message?.type === 'image' && event.message.id) {
    await handleImageMessage(replyToken, lineUserId, event.message.id, user);
    return;
  }
}

// ── Text Message Handler ────────────────────────────────────────

async function handleTextMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  const cmd = detectCommand(text);

  // ── Command shortcuts (reply immediately, no AI needed) ──
  if (cmd === 'open_liff') {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const liffUrl = liffId ? `https://liff.line.me/${liffId}` : 'https://liff.line.me/';
    await sendLineReply(replyToken, `เปิดแอป MyFam ได้ที่นี่\n${liffUrl}`, menuQuickReply);
    return;
  }

  if (cmd === 'unlink') {
    await prisma.lineLink.deleteMany({ where: { userId: user.id } });
    await sendLineReply(replyToken, 'ยกเลิกการเชื่อมต่อเรียบร้อยแล้ว');
    return;
  }

  if (cmd === 'balance') {
    const reply = await handleBalanceQuery(user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'recent') {
    const reply = await handleRecentQuery(user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'summary') {
    await handleSummaryFlex(replyToken, user);
    return;
  }

  if (cmd === 'budget') {
    await handleBudgetFlex(replyToken, user);
    return;
  }

  if (cmd === 'help') {
    await sendLineReply(
      replyToken,
      `🤖 MyFam Bot\n\nพิมพ์หรือถามได้เลย:\n📝 บันทึกรายการ — "ซื้อข้าว 85"\n📸 ส่งรูปสลิป — บันทึกอัตโนมัติ\n💬 ถามได้ เช่น "เหลือเท่าไหร่"`,
      menuQuickReply,
    );
    return;
  }

  if (cmd === 'delete_last') {
    const reply = await handleDeleteLast(user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'confirm_expense' || cmd === 'confirm_income') {
    const confirmedType: 'expense' | 'income' = cmd === 'confirm_expense' ? 'expense' : 'income';
    const reply = await confirmPendingTransaction(user, confirmedType);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'cancel') {
    const reply = await cancelPendingTransaction(user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'select_group') {
    const groupId = text.split(':')[1];
    if (groupId) {
      const { text: replyText, quickReply } = await handleSelectGroup(groupId, user);
      await sendLineReply(replyToken, replyText, quickReply);
    }
    return;
  }

  if (cmd === 'select_subcategory') {
    const categoryId = text.split(':')[1];
    if (categoryId) {
      const reply = await handleSelectSubcategory(categoryId, user);
      await sendLineReply(replyToken, reply, menuQuickReply);
    }
    return;
  }

  if (cmd === 'skip_group' || cmd === 'skip_subcategory') {
    await sendLineReply(replyToken, '✅ ข้ามการเลือกหมวดหมู่', menuQuickReply);
    return;
  }

  // ── AI-powered text processing (needs time) ──
  // Reply "processing" immediately, then push result
  await sendLineReply(replyToken, '⏳ กำลังประมวลผล...');

  try {
    const intent = await detectIntent(text);
    console.log(`[webhook] intent: ${intent} for text: "${text.slice(0, 50)}"`);

    // Route by intent
    if (intent === 'balance') {
      const reply = await handleBalanceQuery(user);
      await sendLinePush(lineUserId, reply, menuQuickReply);
      return;
    }

    if (intent === 'recent') {
      const reply = await handleRecentQuery(user);
      await sendLinePush(lineUserId, reply, menuQuickReply);
      return;
    }

    if (intent === 'summary') {
      const reply = await handleSummaryQuery(user);
      await sendLinePush(lineUserId, reply, menuQuickReply);
      return;
    }

    if (intent === 'budget') {
      const familyBudgets = await prisma.budget.findMany({
        where: { createdBy: { familyId: user.familyId } },
        include: { transactions: { where: { status: 'completed' } } },
      });
      const budgetData = familyBudgets.map((b) => {
        const totalActual = b.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
        return { title: b.title, used: totalActual, limit: Number(b.limit) };
      });
      const localFmt = new Intl.NumberFormat('th-TH');
      const reply = budgetData.length === 0
        ? 'ยังไม่มีงบประมาณ'
        : budgetData.map((b) => {
            const pct = b.limit > 0 ? Math.round((b.used / b.limit) * 100) : 0;
            return `📈 ${b.title}: ฿${localFmt.format(b.used)} / ฿${localFmt.format(b.limit)} (${pct}%)`;
          }).join('\n');
      await sendLinePush(lineUserId, reply, menuQuickReply);
      return;
    }

    if (intent === 'help') {
      await sendLinePush(
        lineUserId,
        `🤖 MyFam Bot ช่วยอะไรได้บ้าง:\n\n📝 บันทึกรายการ — พิมพ์ เช่น "ซื้อข้าว 85 บาท"\n📸 อ่านสลิป — ส่งรูปสลิป/ใบเสร็จ\n📊 ดูยอด — พิมพ์ "ดูยอด"\n📋 รายการล่าสุด — พิมพ์ "รายการล่าสุด"\n📈 สรุปยอด — พิมพ์ "สรุปยอด"\n💸 งบประมาณ — พิมพ์ "งบ"`,
        menuQuickReply,
      );
      return;
    }

    // intent === 'create_transaction'
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = getCategoryContext(categories);
    const extracted = await extractFromText(text, categoryContext);

    // Low confidence — likely not a transaction, show help
    if (extracted.confidence < 0.3) {
      await sendLinePush(
        lineUserId,
        `🤔 ไม่เข้าใจข้อความ "${text.length > 30 ? text.slice(0, 30) + '...' : text}"\n\nลองพิมพ์เช่น:\n📝 "ซื้อข้าว 85 บาท" — บันทึกรายการ\n📊 "ดูยอด" — ดูยอดเงิน\n📋 "รายการล่าสุด" — ดูรายการล่าสุด\n📈 "สรุปยอด" — สรุปรายรับรายจ่าย\n❓ "ช่วยเหลือ" — ดูคำสั่งทั้งหมด`,
        menuQuickReply,
      );
      return;
    }

    // No amount found — ask user to specify
    if (extracted.amount === 0) {
      await sendLinePush(
        lineUserId,
        `ไม่พบจำนวนเงินในข้อความ\n\nกรุณาระบุจำนวนเงิน เช่น "ซื้อข้าว 85 บาท"`,
        menuQuickReply,
      );
      return;
    }

    // If type is uncertain, ask for confirmation
    if (extracted.needsConfirmation) {
      const fmt = new Intl.NumberFormat('th-TH');
      const typeGuess = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';

      // Create pending transaction
      await createTransactionFromExtracted(extracted, user, 'pending');

      const replyText = `❓ ไม่แน่ใจประเภทรายการ\n📝 ${extracted.description}\n💰 ${fmt.format(extracted.amount)} บาท\n🔍 ตรวจจับเป็น: ${typeGuess}\n\nกรุณายืนยันประเภท:`;

      await sendLinePush(lineUserId, replyText, formatQuickReply(CONFIRM_TYPE_ITEMS));
      return;
    }

    const transaction = await createTransactionFromExtracted(extracted, user);
    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLinePush(lineUserId, replyText, menuQuickReply);
  } catch (error) {
    console.error('Text processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}

// ── Image Message Handler ────────────────────────────────────────

async function handleImageMessage(
  replyToken: string,
  lineUserId: string,
  messageId: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  // Acknowledge immediately — OCR takes time
  await sendLineReply(replyToken, '⏳ กำลังอ่านสลิป...');

  try {
    // Download image from LINE
    const imageBuffer = await downloadLineImage(messageId);
    const imageBase64 = imageBuffer.toString('base64');

    // Process with AI
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = getCategoryContext(categories);
    const extracted = await extractFromSlip(imageBase64, categoryContext);

    if (extracted.confidence < 0.3) {
      await sendLinePush(
        lineUserId,
        'ไม่สามารถอ่านสลิปได้ กรุณาส่งรูปที่ชัดกว่านี้ หรือพิมพ์รายละเอียดแทน',
        menuQuickReply,
      );
      return;
    }

    if (extracted.amount === 0) {
      await sendLinePush(
        lineUserId,
        'ไม่พบจำนวนเงินในสลิป กรุณาส่งรูปที่ชัดกว่านี้ หรือพิมพ์รายละเอียดแทน',
        menuQuickReply,
      );
      return;
    }

    // If type is uncertain, ask for confirmation
    if (extracted.needsConfirmation) {
      const fmt = new Intl.NumberFormat('th-TH');
      const typeGuess = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';

      // Create pending transaction
      await createTransactionFromExtracted(extracted, user, 'pending');

      const replyText = `❓ ไม่แน่ใจประเภทรายการ\n📝 ${extracted.description}\n💰 ${fmt.format(extracted.amount)} บาท\n🔍 ตรวจจับเป็น: ${typeGuess}\n\nกรุณายืนยันประเภท:`;

      await sendLinePush(lineUserId, replyText, formatQuickReply(CONFIRM_TYPE_ITEMS));
      return;
    }

    const transaction = await createTransactionFromExtracted(extracted, user);

    // Save slip image to transaction
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { slipImage: `data:image/jpeg;base64,${imageBase64}` },
    });

    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLinePush(lineUserId, replyText, menuQuickReply);
  } catch (error) {
    console.error('Image processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}

// ── GET Handler (LINE Webhook Verification) ──────────────────────────

export async function GET() {
  // LINE sends a GET request to verify the webhook URL is reachable.
  // We just need to return 200 OK to confirm the endpoint is alive.
  return NextResponse.json({ status: 'ok' });
}

// ── POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      console.error('LINE_CHANNEL_SECRET not configured');
      return NextResponse.json({ error: 'LINE not configured' }, { status: 500 });
    }

    const signature = request.headers.get('x-line-signature');
    const rawBody = await request.text();

    console.log('[webhook] Received POST, signature:', signature ? `${signature.slice(0, 10)}...` : 'null');
    console.log('[webhook] Body length:', rawBody.length);

    if (!verifyLineSignature(rawBody, signature, channelSecret)) {
      console.error('[webhook] Signature verification FAILED');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    console.log('[webhook] Signature verified OK');

    const body: LineWebhookBody = JSON.parse(rawBody);

    // Process each event independently
    const results = await Promise.allSettled(
      (body.events || []).map((event) => handleLineEvent(event)),
    );

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