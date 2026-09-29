import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Query handler tests — th-TH formatting, summary ranges, truncation.
 * All DB access is mocked; formatting must be deterministic (no AI).
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    transaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
    budget: { findMany: vi.fn() },
  },
}));

const {
  handleBalanceQuery,
  handleRecentQuery,
  handleSummaryQuery,
  handleBudgetQuery,
  resolveSummaryRange,
  summaryRangeStart,
} = await import('./queries');
const { prisma } = await import('@/lib/prisma');
const { FMT_AMOUNT, truncateMessage, TELEGRAM_MAX_LEN } = await import('./format');

const USER = { id: 'user-1', name: 'Lita', role: 'child', familyId: 'fam-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveSummaryRange', () => {
  it('สัปดาห์ → week, วันนี้ → day, default month', () => {
    expect(resolveSummaryRange('สรุปสัปดาห์นี้')).toBe('week');
    expect(resolveSummaryRange('สรุปวันนี้')).toBe('day');
    expect(resolveSummaryRange('สรุปเดือนนี้')).toBe('month');
    expect(resolveSummaryRange('สรุป')).toBe('month');
  });
});

describe('summaryRangeStart — Bangkok anchoring', () => {
  it('day start is midnight +07:00', () => {
    const start = summaryRangeStart('day');
    // Midnight Bangkok = 17:00 UTC the previous day
    expect(start.getUTCHours()).toBe(17);
    expect(start.getUTCMinutes()).toBe(0);
  });

  it('month start is the 1st at Bangkok midnight', () => {
    const start = summaryRangeStart('month');
    expect(start.getUTCDate() === 1 || start.getUTCHours() === 17).toBe(true);
    const utcDate = new Date(start.getTime() + 7 * 3600 * 1000);
    expect(utcDate.getUTCDate()).toBe(1);
  });

  it('week start is Monday', () => {
    const start = summaryRangeStart('week');
    // shift to Bangkok wall clock then check the weekday
    const bangkok = new Date(start.getTime() + 7 * 3600 * 1000);
    expect(bangkok.getUTCDay()).toBe(1); // Monday
  });
});

describe('handleBalanceQuery', () => {
  it('lists accounts with th-TH formatting and a total', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'a1', name: 'กสิกร', alias: 'kbank', balance: 12500 },
      { id: 'a2', name: ' PromptPay', alias: null, balance: -200 },
    ] as never);

    const text = await handleBalanceQuery(USER);
    expect(text).toContain('กสิกร');
    expect(text).toContain(FMT_AMOUNT.format(12500));
    expect(text).toContain(FMT_AMOUNT.format(12300)); // 12500 - 200
    expect(text).toContain('ยอดติดลบ');
    expect(text).toContain('ปรับยอด');
  });

  it('no accounts → guidance message', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    const text = await handleBalanceQuery(USER);
    expect(text).toContain('ยังไม่มีบัญชี');
  });
});

describe('handleRecentQuery', () => {
  it('formats the 5 latest with icons and Bangkok dates', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      {
        description: 'ซื้อข้าวผัด', amount: 85, type: 'expense', date: new Date('2026-09-29T03:00:00Z'),
        category: { group: { name: 'อาหาร' } }, account: { name: 'กสิกร' },
      },
      {
        description: 'เงินเดือน', amount: 45000, type: 'income', date: new Date('2026-09-28T03:00:00Z'),
        category: { group: { name: 'รายรับ' } }, account: { name: 'กสิกร' },
      },
    ] as never);

    const text = await handleRecentQuery(USER);
    expect(text).toContain('🔴 ซื้อข้าวผัด');
    expect(text).toContain('🟢 เงินเดือน');
    expect(text).toContain('อาหาร');
  });
});

describe('handleSummaryQuery', () => {
  it('aggregates income/expense and ranks top categories', async () => {
    vi.mocked(prisma.transaction.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 45000 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 12500 } } as never);
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { amount: 5000, category: { group: { name: 'อาหาร' } } },
      { amount: 4000, category: { group: { name: 'อาหาร' } } },
      { amount: 3000, category: { group: { name: 'เดินทาง' } } },
    ] as never);

    const text = await handleSummaryQuery(USER, 'month');
    expect(text).toContain(FMT_AMOUNT.format(45000));
    expect(text).toContain(FMT_AMOUNT.format(12500));
    expect(text).toContain(FMT_AMOUNT.format(32500)); // net
    expect(text).toContain('1. อาหาร');
    expect(text.indexOf('อาหาร')).toBeLessThan(text.indexOf('เดินทาง'));
  });
});

describe('handleBudgetQuery', () => {
  it('shows used/limit with status icons', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      { title: 'ค่าอาหาร', limit: 5000, transactions: [{ amount: 4200 }] },  // 84% ⚠️
      { title: 'ค่าเดินทาง', limit: 1000, transactions: [{ amount: 1100 }] }, // 110% 🚨
    ] as never);

    const text = await handleBudgetQuery(USER);
    expect(text).toContain('⚠️ ค่าอาหาร');
    expect(text).toContain('🚨 ค่าเดินทาง');
    expect(text).toContain('(84%)');
  });

  it('no budgets → guidance message', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    expect(await handleBudgetQuery(USER)).toContain('ยังไม่มีงบประมาณ');
  });
});

describe('truncateMessage', () => {
  it('caps output at the Telegram limit', () => {
    expect(TELEGRAM_MAX_LEN).toBe(4096);
    const long = 'x'.repeat(5000);
    expect(truncateMessage(long).length).toBeLessThanOrEqual(TELEGRAM_MAX_LEN);
    expect(truncateMessage('short')).toBe('short');
  });
});