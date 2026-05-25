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
  formatConfirmationPrompt,
  formatErrorMessage,
  detectIntent,
  formatQuickReply,
  QUICK_REPLY_ITEMS,
  CONFIRM_TYPE_ITEMS,
  CONFIRM_ITEMS,
  buildCategoryGroupReply,
  buildSubcategoryReply,
  buildAccountReply,
  buildDirectionReply,
  buildConfirmReply,
  validateExtracted,
  hashImageBuffer,
  FMT_AMOUNT,
  extractReconcile,
  buildReconcileConfirmReply,
  ROUTED_INTENTS,
  type ExtractedTransaction,
  type ExtractedReconcile,
} from '@/lib/ollama';
import { buildMonthlySummaryFlex, buildBudgetProgressFlex } from '@/lib/chart-message';
import { sendLineFlexReply } from '@/lib/line';
import { handleIntent } from '@/lib/intent-router';
import { parseOnboardingAnswers, getOnboardingQuestions, type UserIdentity } from '@/prompt';

export const maxDuration = 300;

// Temporary storage for extractions waiting for account selection
// Key: userId, Value: extracted transaction data + lineUserId + transfer step
const pendingExtractions = new Map<
  string,
  {
    extracted: ExtractedTransaction;
    lineUserId: string;
    step?: 'select_source' | 'select_dest' | 'awaiting_direction' | 'awaiting_confirm' | 'awaiting_category' | 'awaiting_reconcile_account' | 'awaiting_reconcile_confirm' | 'awaiting_account';
    sourceAccountId?: string;
    singleAccount?: Awaited<ReturnType<typeof findDefaultAccount>>;
    imageBuffer?: Buffer;
    imageHash?: string;
    categories?: Awaited<ReturnType<typeof getCategoriesForFamily>>;
    reconcileData?: ExtractedReconcile & { accountId: string; accountName: string; currentBalance: number; newBalance: number; difference: number };
  }
>();

// Track consecutive failures per user to offer escalation
const consecutiveFailures = new Map<string, { count: number; lastFailure: number }>();

// Track onboarding state per user
const onboardingState = new Map<string, { step: number; answers: Partial<UserIdentity> }>();

function incrementFailure(userId: string): string {
  const now = Date.now();
  const entry = consecutiveFailures.get(userId);
  if (!entry || now - entry.lastFailure > 5 * 60 * 1000) {
    consecutiveFailures.set(userId, { count: 1, lastFailure: now });
    return '';
  }
  entry.count += 1;
  entry.lastFailure = now;
  consecutiveFailures.set(userId, entry);
  if (entry.count >= 3) {
    return '\n\n💁 หากต้องการความช่วยเหลือเพิ่มเติม พิมพ์ "ขอคุยกับเจ้าหน้าที่"';
  }
  return '';
}

function resetFailures(userId: string): void {
  consecutiveFailures.delete(userId);
}

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

function parseUserIdentity(raw: string | null | undefined): UserIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.roleContext) return parsed as UserIdentity;
  } catch { /* ignore */ }
  return null;
}

// ── Quick Reply Shorthand ──────────────────────────────────────

const menuQuickReply = formatQuickReply(QUICK_REPLY_ITEMS);

const unlinkedQuickReply = formatQuickReply([
  { label: '📱 สมัครใหม่ สร้างครอบครัว', type: 'uri', uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || ''}` },
  { label: '🔗 มีบัญชีแล้ว ขอลิงก์', action: 'ขอลิงก์เชื่อมต่อ' },
]);

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
  | 'select_account'
  | 'skip_group'
  | 'skip_subcategory'
  | 'money_in'
  | 'money_out'
  | 'confirm'
  | 'change_category'
  | 'reconcile'
  | 'confirm_reconcile'
  | 'cancel_reconcile'
  | 'six_jars'
  | 'three_mini_jars'
  | 'none';

function detectCommand(text: string): CommandType {
  const q = text.trim();

  // Exact match for Quick Reply action texts
  if (q === 'ยืนยันรายจ่าย') return 'confirm_expense';
  if (q === 'ยืนยันรายรับ') return 'confirm_income';
  if (q === 'ยกเลิก') return 'cancel';
  if (q === 'ยืนยัน') return 'confirm';
  if (q === 'เปลี่ยนหมวด') return 'change_category';
  if (q === 'ยืนยันปรับยอด') return 'confirm_reconcile';
  if (q === 'ยกเลิกปรับยอด') return 'cancel_reconcile';
  if (q.startsWith('เลือกหมวด:')) return 'select_group';
  if (q.startsWith('เลือกประเภท:')) return 'select_subcategory';
  if (q.startsWith('เลือกบัญชี:')) return 'select_account';
  if (q === 'ข้ามหมวด') return 'skip_group';
  if (q === 'ข้ามประเภท') return 'skip_subcategory';
  if (q === 'เงินเข้า') return 'money_in';
  if (q === 'เงินออก') return 'money_out';

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
  if (/ปรับยอด|กระทบยอด|reconcile|adjust balance|แก้ยอด|แก้ไขยอด/i.test(q)) return 'reconcile';
  if (/\b6\s*jars?\b|six\s*jars?|\b6jar\b|ระบบ\s*6|หก\s*jars?/i.test(q)) return 'six_jars';
  if (/\b3\s*(mini\s*)?jars?\b|three\s*jars?|mini\s*jars?|สาม\s*(mini\s*)?jars?/i.test(q)) return 'three_mini_jars';
  if (/\bjars?\b|jar\s*system|ระบบ\s*jar|ระบบจัดการเงิน|การเงิน\s*jar/i.test(q)) return 'six_jars';

  return 'none';
}

// ── Query Handlers ──────────────────────────────────────────────

// ── Escalation ─────────────────────────────────────────────────

function detectEscalate(text: string): boolean {
  const q = text.toLowerCase().trim();
  return /(ขอคุยกับคน|ขอคุยกับเจ้าหน้าที่|ติดต่อเจ้าหน้าที่|ติดต่อ\s*support|ขอความช่วยเหลือ|คุยกับคน|talk to human|support|agent|customer service|ติดต่อแอดมิน|ขอคุยกับแอดมิน)/i.test(q);
}

async function handleEscalate(
  replyToken: string,
  lineUserId: string,
  user: { id: string; name: string; familyId: string },
): Promise<void> {
  console.error(`[ESCALATE] User ${user.name} (${user.id}) from family ${user.familyId} via LINE ${lineUserId} requests human help`);
  await sendLineReply(
    replyToken,
    'แจ้งเจ้าหน้าที่ให้แล้ว จะติดต่อกลับทางไลน์โดยเร็วที่สุด 🙏\n\nระหว่างนี้สามารถใช้งานฟีเจอร์อื่นๆ ได้ตามปกติ เช่น ดูยอด รายการล่าสุด สรุปยอด',
    menuQuickReply,
  );
}

// ── Jar System Knowledge ───────────────────────────────────────

async function handleJarsQuery(system: '6-jars' | '3-mini-jars'): Promise<string> {
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  const filePath = join(process.cwd(), 'src/prompt/knowledge', `${system}.md`);
  const content = await readFile(filePath, 'utf-8');
  // Strip the markdown H1 title (first line starting with #)
  const body = content.replace(/^# .*\n/, '').trim();
  return body;
}

// ── Query Handlers ─────────────────────────────────────────────

async function handleBalanceQuery(user: { id: string; role: string; familyId: string }): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: { ownerId: user.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    return 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน';
  }

  const lines = accounts.map((a) => {
    const bal = Number(a.balance);
    const prefix = bal < 0 ? '⚠️ ' : '💳 ';
    return `${prefix}${a.name}: ${FMT_AMOUNT.format(bal)} บาท`;
  });
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  lines.push(`\n💰 รวมทุกบัญชี: ${FMT_AMOUNT.format(total)} บาท`);

  const negativeAccounts = accounts.filter((a) => Number(a.balance) < 0);
  if (negativeAccounts.length > 0) {
    const negLines = negativeAccounts.map((a) => `⚠️ ${a.name}: ${FMT_AMOUNT.format(Number(a.balance))} บาท`);
    lines.push(`\n🚨 ยอดติดลบ:\n${negLines.join('\n')}`);
    lines.push('💡 พิมพ์ "ปรับยอด" เพื่อปรับยอดเงินในบัญชี');
  }

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

  const lines = transactions.map((t) => {
    const icon = t.type === 'income' ? '🟢' : t.type === 'transfer' ? '🔄' : '🔴';
    const typeLabel = t.type === 'income' ? '+' : '-';
    const dt = t.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const tm = t.date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${icon} ${t.description || 'ไม่ระบุ'} ${typeLabel}${FMT_AMOUNT.format(Number(t.amount))} บาท (${t.category?.group?.name ?? '-'}) — ${dt} ${tm}`;
  });

  return `📋 รายการล่าสุด (${transactions.length} รายการ)\n${lines.join('\n')}`;
}

async function handleSummaryQuery(user: { id: string; role: string; familyId: string }): Promise<string> {
  const scope = getDataScope(user);
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

  const balance = totalIncome - totalExpense;
  let result = `📊 สรุปยอดเดือน${monthName}\n🟢 รายรับ: ${FMT_AMOUNT.format(totalIncome)} บาท\n🔴 รายจ่าย: ${FMT_AMOUNT.format(totalExpense)} บาท\n💰 คงเหลือ: ${FMT_AMOUNT.format(balance)} บาท`;
  if (balance < 0) {
    result += `\n🚨 ยอดรวมติดลบ`;
  }
  return result;
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
  account?: Awaited<ReturnType<typeof findDefaultAccount>>,
  toAccount?: Awaited<ReturnType<typeof findDefaultAccount>>,
  imageHash?: string,
) {
  const resolvedAccount = account || (await findDefaultAccount(user.id));
  if (!resolvedAccount) {
    throw new Error('User has no active account');
  }

  return prisma.$transaction(async (tx) => {
    const fee = extracted.fee || 0;
    const totalAmount = extracted.amount + fee;

    // Preserve actual recording time unless AI extracted a specific time from slip/text
    const now = new Date();
    const extractedDate = new Date(extracted.date);
    const hasTime = extracted.date.includes('T') || extracted.date.includes(':');
    const date = hasTime ? extractedDate : new Date(
      extractedDate.getFullYear(),
      extractedDate.getMonth(),
      extractedDate.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );

    const transaction = await tx.transaction.create({
      data: {
        amount: extracted.amount,
        date,
        type: extracted.type,
        description: extracted.description,
        status,
        accountId: resolvedAccount.id,
        toAccountId: extracted.type === 'transfer' ? toAccount?.id ?? null : null,
        categoryId: extracted.categoryId,
        createdById: user.id,
        fee,
        totalAmount,
        imageHash: imageHash ?? null,
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
      if (extracted.type === 'income') {
        await tx.account.update({
          where: { id: resolvedAccount.id },
          data: { balance: { increment: totalAmount } },
        });
      } else if (extracted.type === 'transfer') {
        if (!toAccount) {
          throw new Error('Transfer requires destination account');
        }
        await tx.account.update({
          where: { id: resolvedAccount.id },
          data: { balance: { decrement: totalAmount } },
        });
        await tx.account.update({
          where: { id: toAccount.id },
          data: { balance: { increment: totalAmount } },
        });
      } else {
        await tx.account.update({
          where: { id: resolvedAccount.id },
          data: { balance: { decrement: totalAmount } },
        });
      }
    }

    return transaction;
  });
}

// ── Account Selection Helper ─────────────────────────────────────

function formatAmountLine(extracted: ExtractedTransaction): string {
  const fee = extracted.fee || 0;
  const totalAmount = extracted.amount + fee;
  return fee > 0
    ? `💰 ${FMT_AMOUNT.format(extracted.amount)} + ค่าธรรมเนียม ${FMT_AMOUNT.format(fee)} = ${FMT_AMOUNT.format(totalAmount)} บาท`
    : `💰 ${FMT_AMOUNT.format(extracted.amount)} บาท`;
}

function getAccountPromptText(extracted: ExtractedTransaction): string {
  const amountLine = formatAmountLine(extracted);

  if (extracted.type === 'income') {
    return `📝 ${extracted.description}\n${amountLine}\n\nเลือกบัญชีที่รับเงิน:`;
  }
  if (extracted.type === 'transfer') {
    return `📝 ${extracted.description}\n${amountLine}\n\nเลือกบัญชีต้นทาง:`;
  }
  return `📝 ${extracted.description}\n${amountLine}\n\nเลือกบัญชีที่จ่าย:`;
}

async function promptAccountSelection(
  extracted: ExtractedTransaction,
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
  slipData?: { imageBuffer?: Buffer; imageHash?: string; categories?: Awaited<ReturnType<typeof getCategoriesForFamily>> },
): Promise<{ transaction: Awaited<ReturnType<typeof createTransactionFromExtracted>> | null; waiting: boolean }> {
  const accounts = await prisma.account.findMany({
    where: { ownerId: user.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    await sendLinePush(lineUserId, 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน', menuQuickReply);
    return { transaction: null, waiting: false };
  }

  // Try fuzzy match by account name
  let matchedAccount = null;
  if (extracted.accountName) {
    const searchName = extracted.accountName.toLowerCase();
    matchedAccount = accounts.find((a) =>
      a.name.toLowerCase().includes(searchName) ||
      searchName.includes(a.name.toLowerCase()),
    ) ?? null;
  }

  // Transfer with single-account resolution (external party on the other side)
  // Ask user whether money is coming in or going out, then record as income/expense
  if (extracted.type === 'transfer') {
    if (matchedAccount) {
      if (accounts.length < 2) {
        // Only 1 account in the system — ask direction
        pendingExtractions.set(user.id, { extracted, lineUserId, step: 'awaiting_direction', singleAccount: matchedAccount, ...slipData });
        await sendLinePush(
          lineUserId,
          `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nระบุเป็นธุรกรรมโอน แต่มีบัญชีเดียวในระบบ\nนี่คือเงินเข้าหรือเงินออก?`,
          buildDirectionReply(),
        );
        return { transaction: null, waiting: true };
      }
      // Multiple accounts — start normal two-step transfer flow
      pendingExtractions.set(user.id, { extracted, lineUserId, step: 'select_source', ...slipData });
      const destAccounts = accounts.filter((a) => a.id !== matchedAccount!.id);
      const quickReply = buildAccountReply(destAccounts);
      await sendLinePush(
        lineUserId,
        `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีปลายทาง:`,
        quickReply,
      );
      return { transaction: null, waiting: true };
    }

    if (accounts.length === 1) {
      // Only 1 account and no fuzzy match — ask direction
      pendingExtractions.set(user.id, { extracted, lineUserId, step: 'awaiting_direction', singleAccount: accounts[0], ...slipData });
      await sendLinePush(
        lineUserId,
        `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nระบุเป็นธุรกรรมโอน แต่มีบัญชีเดียวในระบบ\nนี่คือเงินเข้าหรือเงินออก?`,
        buildDirectionReply(),
      );
      return { transaction: null, waiting: true };
    }
  }

  if (matchedAccount) {
    resetFailures(user.id);
    const transaction = await createTransactionFromExtracted(extracted, user, 'completed', matchedAccount);
    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLinePush(lineUserId, replyText, menuQuickReply);
    return { transaction, waiting: false };
  }

  if (accounts.length === 1) {
    resetFailures(user.id);
    const transaction = await createTransactionFromExtracted(extracted, user, 'completed', accounts[0]);
    const replyText = formatConfirmationMessage(transaction, extracted);
    await sendLinePush(lineUserId, replyText, menuQuickReply);
    return { transaction, waiting: false };
  }

  // Multiple accounts — need user selection
  console.log('[SLIP] promptAccountSelection: multi-account for user=%s hasSlip=%s step=awaiting_account', user.id, !!slipData?.imageBuffer);
  pendingExtractions.set(user.id, { extracted, lineUserId, step: 'awaiting_account', ...slipData });
  const quickReply = buildAccountReply(accounts);
  await sendLinePush(lineUserId, getAccountPromptText(extracted), quickReply);
  return { transaction: null, waiting: true };
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

  return `❌ ยกเลิกรายการแล้ว\n📝 ${pending.description || 'ไม่ระบุ'} ${FMT_AMOUNT.format(Number(pending.amount))} บาท`;
}

// ── Category Selection ───────────────────────────────────────────

async function handleSelectGroup(
  groupName: string,
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

  // Find group by name (fallback to id for backward compatibility)
  const group = await prisma.categoryGroup.findFirst({
    where: {
      OR: [{ name: groupName }, { id: groupName }],
    },
  });

  if (!group) {
    return { text: 'ไม่พบหมวดหมู่', quickReply: menuQuickReply };
  }

  // Get subcategories for the selected group
  const categories = await prisma.category.findMany({
    where: { groupId: group.id },
    orderBy: { name: 'asc' },
  });

  if (categories.length === 0) {
    return { text: 'ไม่พบหมวดหมู่ย่อย', quickReply: menuQuickReply };
  }

  const quickReply = buildSubcategoryReply(categories);
  return { text: `📂 เลือกหมวดหมู่ย่อย:`, quickReply };
}

async function handleSelectAccount(
  accountId: string,
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending) {
    await sendLinePush(lineUserId, 'ไม่พบรายการที่รอการเลือกบัญชี', menuQuickReply);
    return;
  }

  // Reconcile account selection
  if (pending.step === 'awaiting_reconcile_account') {
    const account = await prisma.account.findFirst({
      where: { id: accountId, ownerId: user.id, status: 'active' },
    });
    if (!account) {
      await sendLinePush(lineUserId, 'ไม่พบบัญชีที่เลือก', menuQuickReply);
      return;
    }
    await showReconcileConfirmation(user, lineUserId, { id: account.id, name: account.name, balance: Number(account.balance), alias: account.alias }, pending.reconcileData!);
    return;
  }

  // Awaiting direction — user should tap เงินเข้า / เงินออก instead
  if (pending.step === 'awaiting_direction') {
    await sendLinePush(lineUserId, 'กรุณาเลือก เงินเข้า หรือ เงินออก', buildDirectionReply());
    return;
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, ownerId: user.id, status: 'active' },
  });

  if (!account) {
    await sendLinePush(lineUserId, 'ไม่พบบัญชีที่เลือก', menuQuickReply);
    return;
  }

  // Transfer two-step flow
  if (pending.extracted.type === 'transfer') {
    if (pending.step === 'select_dest' && pending.sourceAccountId) {
      // Destination selected — complete transfer
      const { imageBuffer: xferBuf, imageHash: xferHash } = pending;
      pendingExtractions.delete(user.id);

      const sourceAccount = await prisma.account.findFirst({
        where: { id: pending.sourceAccountId, ownerId: user.id, status: 'active' },
      });

      if (!sourceAccount) {
        await sendLinePush(lineUserId, 'ไม่พบบัญชีต้นทาง', menuQuickReply);
        return;
      }

      try {
        resetFailures(user.id);
        const transaction = await createTransactionFromExtracted(pending.extracted, user, 'completed', sourceAccount, account);

        // Save slip image if available
        if (xferBuf) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              imageHash: xferHash ?? null,
              slipImage: `data:image/jpeg;base64,${xferBuf.toString('base64')}`,
            },
          });
        }

        const replyText = formatConfirmationMessage(transaction, pending.extracted);
        await sendLinePush(lineUserId, replyText, menuQuickReply);
      } catch (error) {
        console.error('Transfer completion error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
      }
      return;
    }

    // Source selected — ask for destination
    pendingExtractions.set(user.id, {
      ...pending,
      step: 'select_dest',
      sourceAccountId: account.id,
    });

    const destAccounts = await prisma.account.findMany({
      where: { ownerId: user.id, status: 'active', id: { not: account.id } },
      orderBy: { createdAt: 'asc' },
    });

    if (destAccounts.length === 0) {
      pendingExtractions.delete(user.id);
      await sendLinePush(lineUserId, 'ไม่มีบัญชีอื่นสำหรับโอนเงิน กรุณาสร้างบัญชีเพิ่มในแอป MyFam', menuQuickReply);
      return;
    }

    const quickReply = buildAccountReply(destAccounts);
    await sendLinePush(
      lineUserId,
      `📝 ${pending.extracted.description}\n${formatAmountLine(pending.extracted)}\n\nเลือกบัญชีปลายทาง:`,
      quickReply,
    );
    return;
  }

  // Single account selection for income/expense
  const { imageBuffer: slipBuf, imageHash: slipHash } = pending;
  pendingExtractions.delete(user.id);

  try {
    resetFailures(user.id);
    const transaction = await createTransactionFromExtracted(pending.extracted, user, 'completed', account);

    // Save slip image if available
    if (slipBuf) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          imageHash: slipHash ?? null,
          slipImage: `data:image/jpeg;base64,${slipBuf.toString('base64')}`,
        },
      });
    }

    const replyText = formatConfirmationMessage(transaction, pending.extracted);
    await sendLinePush(lineUserId, replyText, menuQuickReply);
  } catch (error) {
    console.error('Account selection error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}

async function handleSelectSubcategory(
  categoryName: string,
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

  // Find category by name (fallback to id for backward compatibility)
  const category = await prisma.category.findFirst({
    where: {
      OR: [{ name: categoryName }, { id: categoryName }],
    },
    include: { group: true },
  });

  if (!category) {
    return 'ไม่พบหมวดหมู่';
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categoryId: category.id },
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
    include: { account: true, toAccount: true },
  });

  if (!lastTransaction) {
    return 'ไม่พบรายการที่สร้างผ่าน LINE';
  }

  const amount = Number(lastTransaction.amount);

  // Only revert balance if transaction was completed
  if (lastTransaction.status === 'completed' && lastTransaction.accountId) {
    const accountId = lastTransaction.accountId;
    const toAccountId = lastTransaction.toAccountId;
    await prisma.$transaction(async (tx) => {
      if (lastTransaction.type === 'income') {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { decrement: amount } },
        });
      } else if (lastTransaction.type === 'transfer') {
        // Revert source account (increment back)
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: amount } },
        });
        // Revert destination account (decrement back)
        if (toAccountId) {
          await tx.account.update({
            where: { id: toAccountId },
            data: { balance: { decrement: amount } },
          });
        }
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

  const formattedAmount = FMT_AMOUNT.format(amount);
  return `🗑️ ลบรายการแล้ว\n${lastTransaction.description || '-'} ${formattedAmount} บาท`;
}

// ── Reconcile / Adjust Balance ─────────────────────────────────────

async function matchAccountByText(text: string, userId: string) {
  const accounts = await prisma.account.findMany({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) return null;

  const q = text.toLowerCase().trim();

  // Exact name match
  let match = accounts.find((a) => a.name.toLowerCase() === q);
  if (match) return match;

  // Alias match
  match = accounts.find((a) => a.alias && a.alias.toLowerCase() === q);
  if (match) return match;

  // Contains match
  match = accounts.find((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase()));
  if (match) return match;

  return null;
}

async function handleReconcileCommand(
  lineUserId: string,
  text: string,
  user: { id: string; name: string; role: string; familyId: string },
): Promise<void> {
  const extracted = await extractReconcile(text);

  if (extracted.amount === 0 && extracted.confidence < 0.4) {
    const failHint = incrementFailure(user.id);
    await sendLinePush(
      lineUserId,
      '🤔 ไม่สามารถอ่านข้อมูลการปรับยอดได้\n\nตัวอย่างการพิมพ์:\n📝 "ปรับ 1688 เป็น 5000" — ปรับยอดให้เป็น 5000\n📝 "ปรับ make เพิ่ม 1000" — เพิ่มยอด 1000\n📝 "ปรับ make ลด 500" — ลดยอด 500' + failHint,
      menuQuickReply,
    );
    return;
  }

  if (extracted.amount === 0) {
    await sendLinePush(
      lineUserId,
      'กรุณาระบุจำนวนเงินที่ต้องการปรับ\n\nตัวอย่าง: "ปรับ 1688 เป็น 5000"',
      menuQuickReply,
    );
    return;
  }

  // Match account
  const account = extracted.accountNameRaw
    ? await matchAccountByText(extracted.accountNameRaw, user.id)
    : null;

  if (!account) {
    // Show account list with balances for selection
    const accounts = await prisma.account.findMany({
      where: { ownerId: user.id, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });

    if (accounts.length === 0) {
      await sendLinePush(lineUserId, 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน', menuQuickReply);
      return;
    }

    pendingExtractions.set(user.id, {
      extracted: {} as ExtractedTransaction,
      lineUserId,
      step: 'awaiting_reconcile_account',
      reconcileData: {
        accountId: '',
        accountName: '',
        accountNameRaw: extracted.accountNameRaw,
        currentBalance: 0,
        newBalance: 0,
        difference: 0,
        amount: extracted.amount,
        mode: extracted.mode,
        adjustSign: extracted.adjustSign,
        note: extracted.note,
        confidence: extracted.confidence,
      },
    });

    const lines = accounts.map((a) => {
      const bal = Number(a.balance);
      const prefix = bal < 0 ? '⚠️ ' : '💳 ';
      return `${prefix}${a.name}: ${FMT_AMOUNT.format(bal)} บาท${a.alias ? ` (${a.alias})` : ''}`;
    });

    const modeText = extracted.mode === 'set'
      ? `ปรับยอดเป็น ${FMT_AMOUNT.format(extracted.amount)} บาท`
      : `ปรับ${extracted.adjustSign === 1 ? 'เพิ่ม' : 'ลด'} ${FMT_AMOUNT.format(extracted.amount)} บาท`;

    await sendLinePush(
      lineUserId,
      `🔧 ปรับยอด: ${modeText}\n\nกรุณาพิมพ์ชื่อบัญชีที่ต้องการปรับ:\n${lines.join('\n')}`,
      menuQuickReply,
    );
    return;
  }

  await showReconcileConfirmation(user, lineUserId, { id: account.id, name: account.name, balance: Number(account.balance), alias: account.alias }, extracted);
}

async function showReconcileConfirmation(
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
  account: { id: string; name: string; balance: number; alias?: string | null },
  extracted: ExtractedReconcile,
): Promise<void> {
  const currentBalance = Number(account.balance);

  let newBalance: number;
  if (extracted.mode === 'set') {
    newBalance = extracted.amount;
  } else {
    newBalance = currentBalance + extracted.amount * extracted.adjustSign;
  }

  const difference = newBalance - currentBalance;

  const diffText = difference >= 0
    ? `+${FMT_AMOUNT.format(difference)}`
    : FMT_AMOUNT.format(difference);

  const note = extracted.note || 'ปรับยอดจาก LINE';

  pendingExtractions.set(user.id, {
    extracted: {} as ExtractedTransaction,
    lineUserId,
    step: 'awaiting_reconcile_confirm',
    reconcileData: {
      ...extracted,
      accountId: account.id,
      accountName: account.name,
      currentBalance,
      newBalance,
      difference,
    },
  });

  const modeText = extracted.mode === 'set'
    ? `ปรับเป็น ${FMT_AMOUNT.format(extracted.amount)}`
    : extracted.adjustSign === 1
      ? `เพิ่ม ${FMT_AMOUNT.format(extracted.amount)}`
      : `ลด ${FMT_AMOUNT.format(extracted.amount)}`;

  const newBalanceWarn = newBalance < 0 ? '\n⚠️ ยอดใหม่ติดลบ' : '';

  await sendLinePush(
    lineUserId,
    `🔧 ยืนยันการปรับยอด\n\n💳 บัญชี: ${account.name}\n📊 ยอดปัจจุบัน: ${FMT_AMOUNT.format(currentBalance)} บาท\n🔄 ${modeText} (${diffText})\n📊 ยอดใหม่: ${FMT_AMOUNT.format(newBalance)} บาท${newBalanceWarn}\n📝 หมายเหตุ: ${note}\n\nกดยืนยันเพื่อดำเนินการ:`,
    buildReconcileConfirmReply(),
  );
}

async function handleConfirmReconcile(
  user: { id: string; name: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending || !pending.reconcileData || pending.step !== 'awaiting_reconcile_confirm') {
    await sendLinePush(lineUserId, 'ไม่พบรายการปรับยอดที่รอการยืนยัน', menuQuickReply);
    return;
  }

  pendingExtractions.delete(user.id);
  resetFailures(user.id);

  const { accountId, accountName, currentBalance, newBalance, difference, note, mode, amount, adjustSign } = pending.reconcileData;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reconciliation.create({
        data: {
          accountId,
          previousBalance: currentBalance,
          newBalance,
          difference,
          note: note || `ปรับยอดจาก LINE (${mode === 'set' ? 'set' : `adjust ${adjustSign > 0 ? '+' : '-'}${amount}`})`,
          performedById: user.id,
        },
      });

      await tx.account.update({
        where: { id: accountId },
        data: { balance: newBalance },
      });
    });

    const diffText = difference >= 0 ? `+${FMT_AMOUNT.format(difference)}` : FMT_AMOUNT.format(difference);
    await sendLinePush(
      lineUserId,
      `✅ ปรับยอดในบัญชี "${accountName}" เรียบร้อยแล้ว!\n📊 ${FMT_AMOUNT.format(currentBalance)} → ${FMT_AMOUNT.format(newBalance)} (${diffText})`,
      menuQuickReply,
    );
  } catch (error) {
    console.error('[Reconcile] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}

// ── Handle Link Command (deprecated — now guides to invite system) ──

async function handleLinkCommand(
  _text: string,
  replyToken: string,
  _lineUserId: string,
): Promise<void> {
  await sendLineReply(
    replyToken,
    `🔗 การเชื่อมบัญชี MyFam\n\nคุณมีบัญชีใน MyFam อยู่แล้ว แต่ยังไม่ได้เชื่อมกับ LINE?\n\n📌 ให้ผู้ปกครองสร้างลิงก์เชิญให้คุณ:\n1. เปิด MyFam\n2. ไปที่ ⚙️ การตั้งค่า > สมาชิกครอบครัว\n3. กดปุ่ม 🔗 ข้างชื่อของคุณ\n4. ส่งลิงก์ที่ได้ให้คุณ\n\nเมื่อคุณเปิดลิงก์ใน LINE ระบบจะเชื่อมบัญชีให้อัตโนมัติ`,
    unlinkedQuickReply,
  );
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

      if (text.includes('ขอลิงก์') || text.includes('ลิงก์เชื่อมต่อ') || cmd === 'link') {
        await handleLinkCommand(text, replyToken, lineUserId);
        return;
      }

      if (cmd === 'help') {
        await sendLineReply(replyToken, `🤖 MyFam Bot — ผู้ช่วยจัดการเงินครอบครัว\n\n✨ ยังไม่มีบัญชี?\n📱 กด "เปิด MyFam" เพื่อสมัครและสร้างครอบครัว\n\n🔗 มีบัญชีอยู่แล้ว?\nกด "มีบัญชีแล้ว ขอลิงก์" เพื่อดูวิธีเชื่อมต่อ`, unlinkedQuickReply);
        return;
      }
    }

    await sendLineReply(
      replyToken,
      `🤖 MyFam Bot — ผู้ช่วยจัดการเงินครอบครัว\n\n✨ ยังไม่มีบัญชี?\n📱 กด "เปิด MyFam" เพื่อสมัครและสร้างครอบครัว\n\n🔗 มีบัญชีอยู่แล้ว?\nกด "มีบัญชีแล้ว ขอลิงก์" เพื่อดูวิธีเชื่อมต่อ`,
      unlinkedQuickReply,
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
  user: { id: string; name: string; role: string; familyId: string; identity?: string | null },
): Promise<void> {
  const cmd = detectCommand(text);

  // ── Onboarding: first-time user, ask questions to build identity ──
  const identity = parseUserIdentity(user.identity);
  const onboarding = onboardingState.get(user.id);

  if (onboarding) {
    // User is in onboarding flow — parse answer and advance
    const nextAnswers = parseOnboardingAnswers(onboarding.step, text, onboarding.answers);
    const nextStep = onboarding.step + 1;
    const questions = getOnboardingQuestions();

    if (nextStep > questions.length) {
      // Done — save identity to DB
      onboardingState.delete(user.id);
      const finalIdentity: UserIdentity = {
        ...nextAnswers,
        onboardedAt: new Date().toISOString(),
      };
      await prisma.user.update({
        where: { id: user.id },
        data: { identity: JSON.stringify(finalIdentity) },
      });
      await sendLineReply(
        replyToken,
        `ขอบคุณที่แนะนำตัวครับ! 😊\nตอนนี้ผมรู้จักคุณมากขึ้นแล้ว — พร้อมช่วยจัดการเรื่องเงินของครอบครัวคุณแล้วนะครับ\n\nลองถามอะไรก็ได้ เช่น "ดูยอด" หรือ "สรุปยอด"`,
        menuQuickReply,
      );
      return;
    }

    onboardingState.set(user.id, { step: nextStep, answers: nextAnswers });
    await sendLineReply(replyToken, questions[nextStep - 1]);
    return;
  }

  if (!identity && !onboarding) {
    // First time — start onboarding
    const questions = getOnboardingQuestions();
    onboardingState.set(user.id, { step: 1, answers: {} });
    await sendLineReply(replyToken, questions[0]);
    return;
  }
  // ── End onboarding ──

  // ── Escalation detection (before any other processing) ──
  if (detectEscalate(text)) {
    await handleEscalate(replyToken, lineUserId, user);
    return;
  }

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

  if (cmd === 'reconcile') {
    await sendLineReply(replyToken, '⏳ กำลังประมวลผล...');
    await handleReconcileCommand(lineUserId, text, user);
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

  if (cmd === 'six_jars' || cmd === 'three_mini_jars') {
    const system = cmd === 'six_jars' ? '6-jars' : '3-mini-jars';
    const reply = await handleJarsQuery(system);
    await sendLineReply(replyToken, reply, menuQuickReply);
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
    // Also clear any pending account selection
    pendingExtractions.delete(user.id);
    const reply = await cancelPendingTransaction(user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'confirm_reconcile') {
    const pending = pendingExtractions.get(user.id);
    if (pending && pending.step === 'awaiting_reconcile_confirm') {
      await sendLineReply(replyToken, '⏳ กำลังปรับยอด...');
      await handleConfirmReconcile(user, lineUserId);
    } else {
      await sendLineReply(replyToken, 'ไม่พบรายการปรับยอดที่รอการยืนยัน', menuQuickReply);
    }
    return;
  }

  if (cmd === 'cancel_reconcile') {
    const pending = pendingExtractions.get(user.id);
    if (pending && (pending.step === 'awaiting_reconcile_account' || pending.step === 'awaiting_reconcile_confirm')) {
      pendingExtractions.delete(user.id);
      await sendLineReply(replyToken, '❌ ยกเลิกการปรับยอดแล้ว', menuQuickReply);
    } else {
      await sendLineReply(replyToken, 'ไม่พบรายการปรับยอดที่รอการยกเลิก', menuQuickReply);
    }
    return;
  }

  if (cmd === 'confirm') {
    const pending = pendingExtractions.get(user.id);
    if (pending && pending.step === 'awaiting_confirm') {
      await sendLineReply(replyToken, '⏳ กำลังบันทึก...');
      await handleConfirmExtraction(user, lineUserId);
    } else {
      await sendLineReply(replyToken, 'ไม่พบรายการที่รอการยืนยัน', menuQuickReply);
    }
    return;
  }

  if (cmd === 'change_category') {
    await handleChangeCategory(user, lineUserId);
    return;
  }

  if (cmd === 'money_in' || cmd === 'money_out') {
    const pending = pendingExtractions.get(user.id);
    if (!pending || pending.step !== 'awaiting_direction' || !pending.singleAccount) {
      await sendLineReply(replyToken, 'ไม่พบรายการที่รอการยืนยันทิศทาง', menuQuickReply);
      return;
    }

    pendingExtractions.delete(user.id);

    const resolvedType = cmd === 'money_in' ? 'income' : 'expense';
    const modifiedExtracted = { ...pending.extracted, type: resolvedType as 'income' | 'expense' };

    try {
      resetFailures(user.id);
      const transaction = await createTransactionFromExtracted(modifiedExtracted, user, 'completed', pending.singleAccount);
      const replyText = formatConfirmationMessage(transaction, modifiedExtracted);
      await sendLineReply(replyToken, replyText, menuQuickReply);
    } catch (error) {
      console.error('Direction confirm error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await sendLineReply(replyToken, formatErrorMessage(message), menuQuickReply);
    }
    return;
  }

  if (cmd === 'select_group') {
    const groupName = text.split(':').slice(1).join(':');
    if (!groupName) return;

    // If awaiting_category, update category and re-confirm
    const pending = pendingExtractions.get(user.id);
    if (pending && pending.step === 'awaiting_category') {
      await handleCategorySelected(groupName, user, lineUserId);
      return;
    }

    const { text: replyText, quickReply } = await handleSelectGroup(groupName, user);
    await sendLineReply(replyToken, replyText, quickReply);
    return;
  }

  if (cmd === 'select_subcategory') {
    const categoryName = text.split(':').slice(1).join(':');
    if (!categoryName) return;

    // If in awaiting_category flow (subcategory selection)
    const pending = pendingExtractions.get(user.id);
    if (pending && pending.step === 'awaiting_confirm') {
      // Handle as subcategory update for confirmation flow
      const cats = pending.categories || [];
      const cat = cats.find((c) => c.name === categoryName || c.id === categoryName);
      if (cat) {
        const updated = { ...pending.extracted, categoryId: cat.id, categoryGroupName: cat.group.name };
        const scope = getDataScope(user);
        const similar = await findSimilarTransactions(updated, scope);
        const catInfo = { groupName: cat.group.name, subcategoryName: cat.name };
        const promptText = formatConfirmationPrompt(updated, similar.length, catInfo);
        pendingExtractions.set(user.id, { ...pending, extracted: updated, step: 'awaiting_confirm' });
        await sendLinePush(lineUserId, promptText, buildConfirmReply());
        return;
      }
    }

    const reply = await handleSelectSubcategory(categoryName, user);
    await sendLineReply(replyToken, reply, menuQuickReply);
    return;
  }

  if (cmd === 'skip_group' || cmd === 'skip_subcategory') {
    await sendLineReply(replyToken, '✅ ข้ามการเลือกหมวดหมู่', menuQuickReply);
    return;
  }

  if (cmd === 'select_account') {
    const accountName = text.split(':').slice(1).join(':'); // name may contain ':'
    if (accountName) {
      const account = await prisma.account.findFirst({
        where: {
          ownerId: user.id,
          status: 'active',
          OR: [
            { name: accountName },
            { alias: accountName },
          ],
        },
      });
      if (account) {
        await handleSelectAccount(account.id, user, lineUserId);
      } else {
        await sendLinePush(lineUserId, 'ไม่พบบัญชีที่เลือก', menuQuickReply);
      }
    }
    return;
  }

  // ── Pending reconcile account input (text-based) ──
  const pendingRec = pendingExtractions.get(user.id);
  if (pendingRec && pendingRec.step === 'awaiting_reconcile_account') {
    const account = await matchAccountByText(text, user.id);
    if (account) {
      await sendLineReply(replyToken, '⏳ กำลังตรวจสอบ...');
      await showReconcileConfirmation(user, lineUserId, { id: account.id, name: account.name, balance: Number(account.balance), alias: account.alias }, pendingRec.reconcileData!);
    } else {
      await sendLineReply(replyToken, 'ไม่พบบัญชีที่ตรงกับที่ระบุ กรุณาลองใหม่ หรือพิมพ์ชื่อบัญชีให้ชัดเจน', menuQuickReply);
    }
    return;
  }

  // ── Correction check (before AI fallback) ──
  const pendingConfirm = pendingExtractions.get(user.id);
  if (pendingConfirm && pendingConfirm.step === 'awaiting_confirm') {
    const isCorrection = /เปลี่ยน|แก้|เป็น|ไม่ใช่|\d+/.test(text);
    if (isCorrection) {
      await sendLineReply(replyToken, '⏳ กำลังแก้ไข...');
      await handleCorrection(text, user, lineUserId);
      return;
    }
  }

  // ── AI-powered text processing (needs time) ──
  // Reply "processing" immediately, then push result
  await sendLineReply(replyToken, '⏳ กำลังประมวลผล...');

  try {
    const intent = await detectIntent(text);
    console.log(`[webhook] intent: ${intent} for text: "${text.slice(0, 50)}"`);

    // Route query intents through intent-router (example-driven + session memory)
    if (ROUTED_INTENTS.has(intent)) {
      const reply = await handleIntent(intent, text, lineUserId, user, identity);
      resetFailures(user.id);
      await sendLinePush(lineUserId, reply, menuQuickReply);
      return;
    }

    // intent === 'create_transaction'
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = getCategoryContext(categories);
    const extracted = await extractFromText(text, categoryContext);

    // Low confidence — likely not a transaction, show help
    if (extracted.confidence < 0.3) {
      const failHint = incrementFailure(user.id);
      await sendLinePush(
        lineUserId,
        `🤔 ไม่เข้าใจข้อความ "${text.length > 30 ? text.slice(0, 30) + '...' : text}"\n\nลองพิมพ์เช่น:\n📝 "ซื้อข้าว 85 บาท" — บันทึกรายการ\n📊 "ดูยอด" — ดูยอดเงิน\n📋 "รายการล่าสุด" — ดูรายการล่าสุด\n📈 "สรุปยอด" — สรุปรายรับรายจ่าย\n❓ "ช่วยเหลือ" — ดูคำสั่งทั้งหมด` + failHint,
        menuQuickReply,
      );
      return;
    }

    // Run comprehensive validation
    const validation = validateExtracted(extracted);
    if (!validation.valid) {
      const failHint = incrementFailure(user.id);
      await sendLinePush(lineUserId, validation.message + failHint, menuQuickReply);
      return;
    }

    // If type is uncertain, ask for confirmation
    if (extracted.needsConfirmation) {
      const typeGuess = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';

      // Create pending transaction
      await createTransactionFromExtracted(extracted, user, 'pending');

      const replyText = `❓ ไม่แน่ใจประเภทรายการ\n📝 ${extracted.description}\n${formatAmountLine(extracted)}\n🔍 ตรวจจับเป็น: ${typeGuess}\n\nกรุณายืนยันประเภท:`;

      await sendLinePush(lineUserId, replyText, formatQuickReply(CONFIRM_TYPE_ITEMS));
      return;
    }

    // Account selection (type-aware: income=destination, expense=source, transfer=two-step)
    const result = await promptAccountSelection(extracted, user, lineUserId);
    if (result.waiting || !result.transaction) return; // Waiting for user to select account or error
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
  // Fallback: OCR models not ready yet during development
  if (process.env.SLIP_OCR_ENABLED !== 'true') {
    await sendLineReply(
      replyToken,
      'ขออภัย ระบบอ่านสลิปยังไม่พร้อมใช้งานขณะนี้\nกรุณาพิมพ์รายละเอียดรายการแทน เช่น\n"ค่าอาหารกลางวัน 150 บาท" หรือ "โอน 5000 จากกรุงไทยไปกสิกร"',
    );
    return;
  }

  // Acknowledge immediately — AI takes a moment
  await sendLineReply(replyToken, '⏳ กำลังอ่านสลิป...');

  try {
    const imageBuffer = await downloadLineImage(messageId);
    const imageHash = hashImageBuffer(imageBuffer);

    // Check for duplicate image
    const existing = await prisma.transaction.findFirst({
      where: { imageHash, status: { not: 'void' } },
      include: { category: { include: { group: true } }, account: true },
    });

    if (existing) {
      const dateObj = new Date(existing.date);
      const thaiDate = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      const typeLabel = existing.type === 'income' ? 'รายรับ' : existing.type === 'transfer' ? 'โอน' : 'รายจ่าย';
      await sendLinePush(
        lineUserId,
        `📸 สลิปนี้ถูกบันทึกแล้ว!\n\n🔹 รายการ: ${existing.description || '-'}\n🔹 จำนวน: ${FMT_AMOUNT.format(Number(existing.amount))} บาท\n🔹 ประเภท: ${typeLabel}\n🔹 วันที่: ${thaiDate}\n🔹 หมวด: ${existing.category?.group?.name || '-'}\n\nไม่ต้องบันทึกซ้ำ`,
        menuQuickReply,
      );
      return;
    }

    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = getCategoryContext(categories);

    // Gemini 2.5 Flash vision — directly extract from image
    const imageBase64 = imageBuffer.toString('base64');
    const extracted = await extractFromSlip(imageBase64, categoryContext);

    if (extracted.confidence < 0.3 && extracted.amount === 0) {
      await sendLinePush(
        lineUserId,
        'ไม่สามารถอ่านสลิปนี้ได้ กรุณาส่งรูปที่ชัดกว่านี้ หรือพิมพ์รายละเอียดแทน',
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

    await processExtractedSlip(extracted, user, lineUserId, imageBuffer, imageHash, categories);
  } catch (error) {
    console.error('Image processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}

async function findSimilarTransactions(
  extracted: ExtractedTransaction,
  scope: ReturnType<typeof getDataScope>,
) {
  const extractedDate = new Date(extracted.date);
  const amountTolerance = 1;

  return prisma.transaction.findMany({
    where: {
      ...scope,
      type: extracted.type,
      amount: {
        gte: extracted.amount - amountTolerance,
        lte: extracted.amount + amountTolerance,
      },
      date: {
        gte: new Date(extractedDate.getFullYear(), extractedDate.getMonth(), extractedDate.getDate()),
        lt: new Date(extractedDate.getFullYear(), extractedDate.getMonth(), extractedDate.getDate() + 1),
      },
      description: extracted.description,
      status: { not: 'void' },
    },
    include: { category: { include: { group: true } }, account: true },
    take: 3,
  });
}

/**
 * Shared logic: validate extracted data, show confirmation prompt with category,
 * and wait for user to confirm/correct before saving.
 */
async function processExtractedSlip(
  extracted: ExtractedTransaction,
  user: { id: string; name: string; role: string; familyId: string },
  lineUserId: string,
  imageBuffer: Buffer,
  imageHash: string,
  categories: Awaited<ReturnType<typeof getCategoriesForFamily>>,
): Promise<void> {
  if (extracted.confidence < 0.3) {
    await sendLinePush(
      lineUserId,
      'ไม่สามารถอ่านสลิปได้ กรุณาส่งรูปที่ชัดกว่านี้ หรือพิมพ์รายละเอียดแทน',
      menuQuickReply,
    );
    return;
  }

  // Run comprehensive validation
  const validation = validateExtracted(extracted);
  if (!validation.valid) {
    await sendLinePush(lineUserId, validation.message, menuQuickReply);
    return;
  }

  // Check for similar transactions
  const scope = getDataScope(user);
  const similar = await findSimilarTransactions(extracted, scope);

  // Resolve category for display
  const matchedCat = extracted.categoryId
    ? categories.find((c) => c.id === extracted.categoryId)
    : null;
  const catInfo = extracted.categoryGroupName
    ? { groupName: extracted.categoryGroupName, subcategoryName: matchedCat?.name }
    : null;

  // Show confirmation prompt
  const promptText = formatConfirmationPrompt(extracted, similar.length, catInfo);

  // Store pending extraction
  pendingExtractions.set(user.id, {
    extracted,
    lineUserId,
    step: 'awaiting_confirm',
    imageBuffer,
    imageHash,
    categories,
  });

  await sendLinePush(lineUserId, promptText, buildConfirmReply());
}

async function handleConfirmExtraction(
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending || pending.step !== 'awaiting_confirm') {
    await sendLinePush(lineUserId, 'ไม่พบรายการที่รอการยืนยัน', menuQuickReply);
    return;
  }

  // Save slip data before deleting from map
  const { imageBuffer, imageHash, categories } = pending;
  console.log('[SLIP] handleConfirmExtraction: user=%s hasSlip=%s categories=%d', user.id, !!imageBuffer, categories?.length ?? 0);
  pendingExtractions.delete(user.id);

  // Account selection (type-aware: income=destination, expense=source, transfer=two-step)
  const result = await promptAccountSelection(pending.extracted, user, lineUserId, { imageBuffer, imageHash, categories });
  if (result.waiting || !result.transaction) return;

  // Save slip image and hash to the created transaction
  if (pending.imageBuffer) {
    await prisma.transaction.update({
      where: { id: result.transaction.id },
      data: {
        imageHash: pending.imageHash ?? null,
        slipImage: `data:image/jpeg;base64,${pending.imageBuffer.toString('base64')}`,
      },
    });
  }
}

async function handleChangeCategory(
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending || (pending.step !== 'awaiting_confirm' && pending.step !== 'awaiting_category')) {
    await sendLinePush(lineUserId, 'ไม่พบรายการที่รอการแก้ไขหมวดหมู่', menuQuickReply);
    return;
  }

  pendingExtractions.set(user.id, { ...pending, step: 'awaiting_category' });

  const cats = pending.categories || [];
  const groups = [...new Set(cats.map((c) => c.group))].filter(
    (g) => g.type === pending.extracted.type,
  );

  if (groups.length === 0) {
    await sendLinePush(lineUserId, 'ไม่พบหมวดหมู่ที่ตรงกับประเภทรายการนี้', buildConfirmReply());
    return;
  }

  const quickReply = buildCategoryGroupReply(
    groups.map((g) => ({ id: g.id, name: g.name, type: g.type })),
    pending.extracted.type,
  );
  await sendLinePush(lineUserId, '📂 เลือกหมวดหมู่:', quickReply);
}

async function handleCategorySelected(
  groupName: string,
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending || pending.step !== 'awaiting_category') {
    await sendLinePush(lineUserId, 'ไม่พบรายการที่รอการเลือกหมวดหมู่', menuQuickReply);
    return;
  }

  const cats = pending.categories || [];
  const group = cats.find((c) => c.group.name === groupName)?.group;
  if (!group) {
    await sendLinePush(lineUserId, 'ไม่พบหมวดหมู่ที่เลือก', buildConfirmReply());
    return;
  }

  // Update extraction with selected category
  const subcats = cats.filter((c) => c.groupId === group.id);
  const updated = {
    ...pending.extracted,
    categoryGroupName: group.name,
    categoryId: subcats.length === 1 ? subcats[0].id : null,
  };

  // If multiple subcategories, ask to pick one
  if (subcats.length > 1) {
    pendingExtractions.set(user.id, { ...pending, extracted: updated, step: 'awaiting_confirm' });
    const quickReply = buildSubcategoryReply(subcats);
    await sendLinePush(lineUserId, `📂 ${group.name} — เลือกหมวดหมู่ย่อย:`, quickReply);
    return;
  }

  // Show updated confirmation
  const catInfo = { groupName: group.name, subcategoryName: subcats[0]?.name };
  const scope = getDataScope(user);
  const similar = await findSimilarTransactions(updated, scope);
  const promptText = formatConfirmationPrompt(updated, similar.length, catInfo);

  pendingExtractions.set(user.id, { ...pending, extracted: updated, step: 'awaiting_confirm' });
  await sendLinePush(lineUserId, promptText, buildConfirmReply());
}

async function handleCorrection(
  text: string,
  user: { id: string; role: string; familyId: string },
  lineUserId: string,
): Promise<void> {
  const pending = pendingExtractions.get(user.id);
  if (!pending || pending.step !== 'awaiting_confirm') return;

  const cats = pending.categories || [];
  const categoryContext = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: c.group.name,
    groupType: c.group.type,
  }));

  const reExtracted = await extractFromText(text, categoryContext);

  if (reExtracted.confidence < 0.3 && reExtracted.amount === 0) {
    await sendLinePush(
      lineUserId,
      'ไม่เข้าใจการแก้ไข กรุณาลองใหม่ เช่น "เปลี่ยนเป็นค่ากินข้าว 200"',
      buildConfirmReply(),
    );
    return;
  }

  // Merge only non-zero/non-empty fields from re-extraction
  const merged: ExtractedTransaction = {
    ...pending.extracted,
    amount: reExtracted.amount > 0 ? reExtracted.amount : pending.extracted.amount,
    fee: reExtracted.fee !== undefined ? reExtracted.fee : pending.extracted.fee,
    description: reExtracted.description || pending.extracted.description,
    type: reExtracted.confidence > 0.5 ? reExtracted.type : pending.extracted.type,
    categoryGroupName: reExtracted.categoryGroupName || pending.extracted.categoryGroupName,
    categoryId: reExtracted.categoryId || pending.extracted.categoryId,
    merchantName: reExtracted.merchantName || pending.extracted.merchantName,
  };

  // Resolve category for display
  const matchedCat = merged.categoryId
    ? cats.find((c) => c.id === merged.categoryId)
    : null;
  const catInfo = merged.categoryGroupName
    ? { groupName: merged.categoryGroupName, subcategoryName: matchedCat?.name }
    : null;

  const scope = getDataScope(user);
  const similar = await findSimilarTransactions(merged, scope);
  const promptText = formatConfirmationPrompt(merged, similar.length, catInfo);

  pendingExtractions.set(user.id, { ...pending, extracted: merged });
  await sendLinePush(lineUserId, `✅ อัปเดตรายการแล้ว\n\n${promptText}`, buildConfirmReply());
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