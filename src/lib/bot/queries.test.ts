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
const PARENT = { id: 'user-p', name: 'Tukkie', role: 'parent', familyId: 'fam-1' };

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
  it('child view: own accounts under their name header with a subtotal', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'a1', name: 'กสิกร', alias: 'kbank', balance: 12500 },
      { id: 'a2', name: ' PromptPay', alias: null, balance: -200 },
    ] as never);

    const text = await handleBalanceQuery(USER);
    expect(text).toContain('👤 Lita'); // person header
    expect(text).toContain('กสิกร');
    expect(text).toContain(FMT_AMOUNT.format(12500));
    expect(text).toContain(`➕ รวม: ${FMT_AMOUNT.format(12300)}`); // per-person subtotal
    expect(text).toContain(FMT_AMOUNT.format(12300)); // grand total
    expect(text).toContain('ยอดติดลบ');
    expect(text).toContain('ปรับยอด');
  });

  it('no accounts → guidance message', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    const text = await handleBalanceQuery(USER);
    expect(text).toContain('ยังไม่มีบัญชี');
  });

  it('child scope stays own-accounts (ownerId), not family-wide', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    await handleBalanceQuery(USER);
    const where = (vi.mocked(prisma.account.findMany).mock.calls[0] as unknown[])[0] as { where: { ownerId?: string } };
    expect(where.where.ownerId).toBe('user-1');
  });

  it('parent view: family accounts grouped per person under name headers', async () => {
    // causal: the query must scope by owner.familyId for a parent —
    // ownerId scoping would silently hide children's balances
    const findFamilyAccounts = async (args: any): Promise<never> => {
      if (args?.where?.ownerId) {
        throw Object.assign(
          new Error('balance query used child-only ownerId scope for a parent'),
          { code: 'TEST-SCOPE' },
        );
      }
      return [
        { id: 'a1', name: 'ทรูมันนี่', balance: 194.52, owner: { name: 'Lita' } },
        { id: 'a2', name: 'Butjet', balance: 9991, owner: { name: 'Lita' } },
        { id: 'a3', name: 'Cash', balance: -450, owner: { name: 'Tukkie' } },
      ] as never;
    };
    vi.mocked(prisma.account.findMany).mockImplementation(findFamilyAccounts as never);

    const text = await handleBalanceQuery(PARENT);
    // per-person sections with name headers, not "(owner)" suffixes
    expect(text).toContain('👤 Lita');
    expect(text).toContain('👤 Tukkie');
    expect(text).toContain('💳 ทรูมันนี่: 194.52 บาท');
    expect(text).toContain('💳 Butjet: 9,991 บาท');
    expect(text).toContain('⚠️ Cash: -450 บาท');
    // per-person subtotals
    expect(text).toContain(`➕ รวม: ${FMT_AMOUNT.format(194.52 + 9991)}`);
    expect(text).toContain(`➕ รวม: ${FMT_AMOUNT.format(-450)}`);
    // grand total
    expect(text).toContain(`💰 รวมทุกบัญชี: ${FMT_AMOUNT.format(194.52 + 9991 - 450)}`);
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
  it('child view: one per-person section, no family-total line', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { type: 'income', amount: 45000, createdBy: { name: 'Lita' }, category: { group: { name: 'รายรับ' } } },
      { type: 'expense', amount: 5000, createdBy: { name: 'Lita' }, category: { group: { name: 'อาหาร' } } },
    ] as never);

    const text = await handleSummaryQuery(USER, 'month');
    expect(text).toContain('👤 Lita');
    expect(text).toContain(`🟢 รายรับ: ${FMT_AMOUNT.format(45000)} บาท`);
    expect(text).toContain(`🔴 รายจ่าย: ${FMT_AMOUNT.format(5000)} บาท`);
    expect(text).toContain(`💰 สุทธิ: ${FMT_AMOUNT.format(40000)} บาท`);
    expect(text).toContain(`1. อาหาร ${FMT_AMOUNT.format(5000)}`);
    expect(text).not.toContain('รวมทั้งครอบครัว');
  });

  it('parent view: a section per person, biggest spender first, family total at the end', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { type: 'income', amount: 45000, createdBy: { name: 'Lita' }, category: { group: { name: 'รายรับ' } } },
      { type: 'expense', amount: 5000, createdBy: { name: 'Lita' }, category: { group: { name: 'อาหาร' } } },
      { type: 'expense', amount: 4000, createdBy: { name: 'Tukkie' }, category: { group: { name: 'อาหาร' } } },
      { type: 'expense', amount: 3000, createdBy: { name: 'Tukkie' }, category: { group: { name: 'เดินทาง' } } },
    ] as never);

    const text = await handleSummaryQuery(PARENT, 'month');
    // Tukkie spent more (7,000) → section comes before Lita
    expect(text.indexOf('👤 Tukkie')).toBeLessThan(text.indexOf('👤 Lita'));
    expect(text).toContain(`🔴 รายจ่าย: ${FMT_AMOUNT.format(7000)} บาท`);
    expect(text).toContain(`💰 สุทธิ: ${FMT_AMOUNT.format(-7000)} บาท`);
    // family roll-up
    expect(text).toContain(`🏠 รวมทั้งครอบครัว: รับ ${FMT_AMOUNT.format(45000)} | จ่าย ${FMT_AMOUNT.format(12000)} | สุทธิ ${FMT_AMOUNT.format(33000)} บาท`);
  });

  it('empty range → guidance message', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
    expect(await handleSummaryQuery(PARENT, 'month')).toContain('ยังไม่มีรายการ');
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