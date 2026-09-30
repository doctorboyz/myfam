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

  // Report per person with their name as the section header —
  // a child's query only ever holds their own accounts.
  const byPerson = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const person = a.owner?.name ?? user.name;
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person)!.push(a);
  }

  const lines: string[] = ['📊 ยอดคงเหลือ'];
  for (const [person, personAccounts] of byPerson) {
    lines.push(`\n👤 ${person}`);
    for (const a of personAccounts) {
      const bal = Number(a.balance);
      const prefix = bal < 0 ? '⚠️ ' : '💳 ';
      lines.push(`${prefix}${a.name}: ${FMT_AMOUNT.format(bal)} บาท`);
    }
    const subtotal = personAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
    lines.push(`➕ รวม: ${FMT_AMOUNT.format(subtotal)} บาท`);
  }

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  lines.push(`\n💰 รวมทุกบัญชี: ${FMT_AMOUNT.format(total)} บาท`);

  const negativeAccounts = accounts.filter((a) => Number(a.balance) < 0);
  if (negativeAccounts.length > 0) {
    const negLines = negativeAccounts.map(
      (a) => `⚠️ ${a.name} (${a.owner?.name ?? user.name}): ${FMT_AMOUNT.format(Number(a.balance))} บาท`,
    );
    lines.push(`\n🚨 ยอดติดลบ:\n${negLines.join('\n')}`);
    lines.push('💡 พิมพ์ "ปรับยอด" เพื่อปรับยอดเงินในบัญชี');
  }

  return lines.join('\n');
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

  // One fetch, grouped per person in JS — the family is small enough that
  // row-level aggregation beats N per-person DB aggregates.
  const txs = await prisma.transaction.findMany({
    where: { ...scope, deletedAt: null, status: 'completed', date: { gte: start } },
    include: {
      category: { include: { group: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 1000,
  });

  if (txs.length === 0) {
    return `📊 สรุปยอด${label}\nยังไม่มีรายการในช่วงนี้`;
  }

  // Sum per person (header = the person's name), top-3 expense categories each
  const byPerson = new Map<
    string,
    { income: number; expense: number; cats: Map<string, number> }
  >();
  for (const tx of txs) {
    const person = tx.createdBy?.name ?? user.name;
    if (!byPerson.has(person)) byPerson.set(person, { income: 0, expense: 0, cats: new Map() });
    const sums = byPerson.get(person)!;
    const amount = Number(tx.amount);
    if (tx.type === 'income') {
      sums.income += amount;
    } else if (tx.type === 'expense') {
      sums.expense += amount;
      const cat = tx.category?.group?.name || tx.category?.name || 'อื่นๆ';
      sums.cats.set(cat, (sums.cats.get(cat) || 0) + amount);
    }
  }

  // biggest spender first
  const people = Array.from(byPerson.entries()).sort((a, b) => b[1].expense - a[1].expense);

  let result = `📊 สรุปยอด${label}`;
  for (const [person, sums] of people) {
    result += `\n\n👤 ${person}\n🟢 รายรับ: ${FMT_AMOUNT.format(sums.income)} บาท\n🔴 รายจ่าย: ${FMT_AMOUNT.format(sums.expense)} บาท\n💰 สุทธิ: ${FMT_AMOUNT.format(sums.income - sums.expense)} บาท`;
    const topCats = Array.from(sums.cats.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    if (topCats.length > 0) {
      const catList = topCats
        .map((c, i) => `${i + 1}. ${c.name} ${FMT_AMOUNT.format(c.amount)}`)
        .join(' | ');
      result += `\n🏆 จ่ายมากสุด: ${catList}`;
    }
  }

  // roll-up for the parent, whose scope covers the whole family
  if (user.role === 'parent') {
    const familyIncome = Array.from(byPerson.values()).reduce((s, p) => s + p.income, 0);
    const familyExpense = Array.from(byPerson.values()).reduce((s, p) => s + p.expense, 0);
    const familyNet = familyIncome - familyExpense;
    result += `\n\n🏠 รวมทั้งครอบครัว: รับ ${FMT_AMOUNT.format(familyIncome)} | จ่าย ${FMT_AMOUNT.format(familyExpense)} | สุทธิ ${FMT_AMOUNT.format(familyNet)} บาท`;
    if (familyNet < 0) result += `\n\n🚨 ยอดรวมติดลบ`;
  }

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