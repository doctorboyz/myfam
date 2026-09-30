/**
 * Deterministic query handlers — Prisma + Intl formatting, no AI.
 * Summary supports day / week / month ranges in Bangkok time.
 */

import { prisma } from '@/lib/prisma';
import { FMT_AMOUNT } from './format';
import { getDataScope, getAccountScope, type BotUser } from './record';
import { getBangkokDateString } from '@/lib/timezone';

export type SummaryRange = 'day' | 'week' | 'month';

/** Start of the current Bangkok day as a UTC instant. */
function bangkokDayStart(): Date {
  return new Date(`${getBangkokDateString()}T00:00:00+07:00`);
}

/** Shift an instant so Bangkok wall-clock reads as UTC (for date extraction). */
function asBangkokWallClock(d: Date): Date {
  return new Date(d.getTime() + 7 * 60 * 60 * 1000);
}

/** Start of the current Bangkok week (Monday). */
function bangkokWeekStart(): Date {
  const start = bangkokDayStart();
  // Weekday must come from the Bangkok wall clock — the day-start instant
  // itself sits on the previous UTC day (17:00 the evening before).
  const dow = asBangkokWallClock(start).getUTCDay(); // 0=Sun..6=Sat
  const back = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  return new Date(start.getTime() - back * 24 * 60 * 60 * 1000);
}

/** Start of the current Bangkok month. */
function bangkokMonthStart(): Date {
  const wall = asBangkokWallClock(bangkokDayStart());
  // 1st 00:00 +07 = (1st - 7h) in UTC
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1, -7));
}

export function resolveSummaryRange(text: string): SummaryRange {
  if (/สัปดาห์|week/i.test(text)) return 'week';
  if (/วันนี้|today/i.test(text)) return 'day';
  return 'month';
}

export function summaryRangeStart(range: SummaryRange): Date {
  switch (range) {
    case 'day':
      return bangkokDayStart();
    case 'week':
      return bangkokWeekStart();
    case 'month':
      return bangkokMonthStart();
  }
}

export function summaryRangeLabel(range: SummaryRange): string {
  switch (range) {
    case 'day':
      return 'วันนี้';
    case 'week':
      return 'สัปดาห์นี้';
    case 'month':
      return 'เดือนนี้';
  }
}

// ── Balance ───────────────────────────────────────────────────────

export async function handleBalanceQuery(user: BotUser): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: getAccountScope(user),
    // group family members' accounts together in the parent view
    orderBy: [{ owner: { name: 'asc' } }, { createdAt: 'asc' }],
    include: { owner: { select: { name: true } } },
  });

  if (accounts.length === 0) {
    return 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน';
  }

  const label = (a: (typeof accounts)[number]) =>
    user.role === 'parent' && a.owner ? `${a.name} (${a.owner.name})` : a.name;

  const lines = accounts.map((a) => {
    const bal = Number(a.balance);
    const prefix = bal < 0 ? '⚠️ ' : '💳 ';
    return `${prefix}${label(a)}: ${FMT_AMOUNT.format(bal)} บาท`;
  });
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  lines.push(`\n💰 รวมทุกบัญชี: ${FMT_AMOUNT.format(total)} บาท`);

  const negativeAccounts = accounts.filter((a) => Number(a.balance) < 0);
  if (negativeAccounts.length > 0) {
    const negLines = negativeAccounts.map((a) => `⚠️ ${label(a)}: ${FMT_AMOUNT.format(Number(a.balance))} บาท`);
    lines.push(`\n🚨 ยอดติดลบ:\n${negLines.join('\n')}`);
    lines.push('💡 พิมพ์ "ปรับยอด" เพื่อปรับยอดเงินในบัญชี');
  }

  return `📊 ยอดคงเหลือ\n${lines.join('\n')}`;
}

// ── Recent ───────────────────────────────────────────────────────

export async function handleRecentQuery(user: BotUser): Promise<string> {
  const scope = getDataScope(user);
  const transactions = await prisma.transaction.findMany({
    where: { ...scope, deletedAt: null },
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
    const dt = new Intl.DateTimeFormat('th-TH', {
      day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
    }).format(t.date);
    const tm = new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
    }).format(t.date);
    return `${icon} ${t.description || 'ไม่ระบุ'} ${typeLabel}${FMT_AMOUNT.format(Number(t.amount))} บาท (${t.category?.group?.name ?? '-'}) — ${dt} ${tm}`;
  });

  return `📋 รายการล่าสุด (${transactions.length} รายการ)\n${lines.join('\n')}`;
}

// ── Summary (day/week/month + top-3 categories) ────────────────────

export async function handleSummaryQuery(user: BotUser, range: SummaryRange): Promise<string> {
  const scope = getDataScope(user);
  const start = summaryRangeStart(range);
  const label = summaryRangeLabel(range);

  const [income, expense, topTx] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...scope, deletedAt: null, type: 'income', status: 'completed', date: { gte: start } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...scope, deletedAt: null, type: 'expense', status: 'completed', date: { gte: start } },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { ...scope, deletedAt: null, type: 'expense', status: 'completed', date: { gte: start } },
      include: { category: { include: { group: true } } },
      orderBy: { amount: 'desc' },
      take: 30,
    }),
  ]);

  const totalIncome = Number(income._sum.amount ?? 0);
  const totalExpense = Number(expense._sum.amount ?? 0);
  const balance = totalIncome - totalExpense;

  let result = `📊 สรุปยอด${label}\n🟢 รายรับ: ${FMT_AMOUNT.format(totalIncome)} บาท\n🔴 รายจ่าย: ${FMT_AMOUNT.format(totalExpense)} บาท\n💰 คงเหลือ: ${FMT_AMOUNT.format(balance)} บาท`;

  // Top-3 expense categories
  const catMap = new Map<string, number>();
  for (const tx of topTx) {
    const name = tx.category?.group?.name || tx.category?.name || 'อื่นๆ';
    catMap.set(name, (catMap.get(name) || 0) + Number(tx.amount));
  }
  const topCats = Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  if (topCats.length > 0) {
    result += `\n\n🏆 จ่ายมากสุด (${label})`;
    for (const [i, c] of topCats.entries()) {
      result += `\n${i + 1}. ${c.name}: ${FMT_AMOUNT.format(c.amount)} บาท`;
    }
  }

  if (balance < 0) result += `\n\n🚨 ยอดรวมติดลบ`;
  return result;
}

// ── Budget ────────────────────────────────────────────────────────

export async function handleBudgetQuery(user: BotUser): Promise<string> {
  const budgets = await prisma.budget.findMany({
    where: {
      deletedAt: null,
      createdBy: { familyId: user.familyId },
      status: 'active',
    },
    include: { transactions: { where: { status: 'completed', deletedAt: null } } },
    orderBy: { createdAt: 'asc' },
  });

  if (budgets.length === 0) {
    return 'ยังไม่มีงบประมาณ — สร้างได้ในแอป MyFam';
  }

  const lines = budgets.map((b) => {
    const used = b.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const limit = Number(b.limit);
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const icon = pct >= 100 ? '🚨' : pct >= 80 ? '⚠️' : '✅';
    return `${icon} ${b.title}\n   ใช้ไป ${FMT_AMOUNT.format(used)} / ${FMT_AMOUNT.format(limit)} บาท (${pct}%)`;
  });

  return `💰 งบประมาณ\n${lines.join('\n')}`;
}