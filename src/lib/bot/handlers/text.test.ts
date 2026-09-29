import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Full bot flow tests: message → confirm → transaction + balance,
 * query commands, and confirm-without-session handling.
 * Prisma + AI are mocked; the session store runs against an in-memory map,
 * so the real state machine is exercised end to end.
 */

const sessions = new Map<string, { id: string; userId: string; kind: string; step: string; payload: Record<string, unknown>; expiresAt: Date }>();

const mockTx = {
  transaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  account: { update: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(mockTx)),
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    category: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
    budget: { findMany: vi.fn() },
    botSession: {
      findUnique: vi.fn(async (args: any) => {
        const where = args.where;
        const key = `${where.userId_kind.userId}|${where.userId_kind.kind}`;
        const row = sessions.get(key);
        if (!row) return null;
        if (row.expiresAt.getTime() < Date.now()) return null;
        return row;
      }),
      upsert: vi.fn(async (args: any) => {
        const create = args.create;
        const key = `${create.userId}|${create.kind}`;
        const existing = sessions.get(key);
        const row = {
          id: existing?.id ?? 'sess-1',
          userId: create.userId,
          kind: create.kind,
          step: create.step,
          payload: create.payload,
          expiresAt: create.expiresAt,
        };
        sessions.set(key, row);
        return row;
      }),
      deleteMany: vi.fn(async (args: any) => {
        const where = args.where;
        if (where.userId && where.kind) {
          return { count: sessions.delete(`${where.userId}|${where.kind}`) ? 1 : 0 };
        }
        if (where.userId_kind) {
          const key = `${where.userId_kind.userId}|${where.userId_kind.kind}`;
          return { count: sessions.delete(key) ? 1 : 0 };
        }
        return { count: 0 };
      }),
    },
  },
}));

const aiChat = vi.fn();
vi.mock('@/lib/ai-client', () => ({
  aiChat: (...args: unknown[]) => aiChat(...(args as [])),
  AI_EXTRACT_TEXT_MODEL: 'test-model',
  AI_INTENT_MODEL: 'test-model',
  AI_EXTRACT_SLIP_MODEL: 'test-vision-model',
}));

const { handleTextMessage } = await import('./text');
const { prisma } = await import('@/lib/prisma');

const USER = { id: 'user-1', name: 'Lita', role: 'child', familyId: 'fam-1' };

interface Reply {
  text: string;
  keyboard?: unknown;
}
let replies: Reply[] = [];
const sender = async (text: string, keyboard?: unknown) => {
  replies.push({ text, keyboard });
};

function seedSingleAccount() {
  vi.mocked(prisma.account.findMany).mockResolvedValue([
    { id: 'acc-1', name: 'กสิกร', alias: 'kbank', balance: 1000 },
  ] as never);
  vi.mocked(prisma.account.findFirst).mockResolvedValue({
    id: 'acc-1', name: 'กสิกร', alias: 'kbank', balance: 1000,
  } as never);
}

function seedCategories() {
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1' }] as never);
  vi.mocked(prisma.category.findMany).mockResolvedValue([
    { id: 'cat-food', name: 'ค่าอาหาร', userId: null, group: { name: 'อาหาร', type: 'expense', deletedAt: null } },
  ] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessions.clear();
  replies = [];
  seedSingleAccount();
  seedCategories();
  vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
  aiChat.mockReset();
});

describe('text flow: message → confirm → saved with correct balance', () => {
  it('records "ซื้อข้าวผัด 85 บาท" after ยืนยัน', async () => {
    aiChat.mockResolvedValue(
      '{"amount":85,"date":"2026-09-29","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","merchantName":null,"accountName":null,"confidence":0.95,"needsConfirmation":false}',
    );

    // Step 1: the message → confirmation prompt
    await handleTextMessage(USER, sender, 'ซื้อข้าวผัด 85 บาท');
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain('ตรวจสอบรายการก่อนบันทึก');
    expect(replies[0].text).toContain('ซื้อข้าวผัด');
    expect(replies[0].text).toContain('85');
    expect(replies[0].text).toContain('อาหาร');

    // Session stored at awaiting_confirm
    expect(sessions.get('user-1|transaction')?.step).toBe('awaiting_confirm');

    // Step 2: ยืนยัน → created + balance decremented (expense: amount + fee)
    mockTx.transaction.create.mockImplementation(async (args: any) => ({
      id: 'tx-new',
      ...args.data,
      account: { name: 'กสิกร' },
    }));

    await handleTextMessage(USER, sender, 'ยืนยัน');

    expect(mockTx.transaction.create).toHaveBeenCalledTimes(1);
    const createData = mockTx.transaction.create.mock.calls[0][0].data;
    expect(createData.amount).toBe(85);
    expect(createData.type).toBe('expense');
    expect(createData.categoryId).toBe('cat-food');
    expect(createData.createdById).toBe('user-1');
    expect(createData.tagRecords.create[0].tag.connectOrCreate.where.name_userId.name).toBe('telegram-bot');

    // Balance formula: expense → decrement amount + fee (fee 0 → -85)
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { decrement: 85 } },
    });

    // Confirmation + session cleared
    const savedReply = replies.find((r) => r.text.includes('บันทึก'));
    expect(savedReply).toBeTruthy();
    expect(savedReply!.text).toContain('รายจ่าย');
    expect(sessions.has('user-1|transaction')).toBe(false);
  });

  it('income flow increments by amount - fee', async () => {
    aiChat.mockResolvedValue(
      '{"amount":1000,"date":"2026-09-29","description":"ค่าขนม","type":"income","fee":20,"categoryGroupName":"","merchantName":null,"accountName":null,"confidence":0.9,"needsConfirmation":false}',
    );
    mockTx.transaction.create.mockImplementation(async (args: any) => ({ id: 'tx-2', ...args.data }));

    await handleTextMessage(USER, sender, 'รับเงิน 1000 บาท ค่าธรรมเนียม 20');
    await handleTextMessage(USER, sender, 'ยืนยัน');

    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 980 } },
    });
    const createData = mockTx.transaction.create.mock.calls[0][0].data;
    expect(createData.totalAmount).toBe(1020);
  });
});

describe('confirm without a pending session', () => {
  it('tells the user there is nothing to confirm', async () => {
    await handleTextMessage(USER, sender, 'ยืนยัน');
    expect(replies[0].text).toContain('ไม่มีรายการรอยืนยัน');
    expect(mockTx.transaction.create).not.toHaveBeenCalled();
  });
});

describe('cancel drops the pending transaction', () => {
  it('ยกเลิก clears the session and confirms back', async () => {
    aiChat.mockResolvedValue(
      '{"amount":50,"date":"2026-09-29","description":"ขนม","type":"expense","categoryGroupName":"","confidence":0.9,"needsConfirmation":false}',
    );
    await handleTextMessage(USER, sender, 'ซื้อขนม 50 บาท');
    await handleTextMessage(USER, sender, 'ยกเลิก');

    expect(replies[1].text).toContain('ยกเลิกรายการแล้ว');
    expect(sessions.has('user-1|transaction')).toBe(false);
    expect(mockTx.transaction.create).not.toHaveBeenCalled();
  });
});

describe('queries via text', () => {
  it('ดูยอด returns the balance report', async () => {
    await handleTextMessage(USER, sender, 'ดูยอด');
    expect(replies[0].text).toContain('ยอดคงเหลือ');
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('invalid extraction (amount 0) gets the Thai missing-fields message', async () => {
    aiChat.mockResolvedValue(
      '{"amount":0,"date":"2026-09-29","description":"สวัสดี","type":"expense","categoryGroupName":"","confidence":0.1,"needsConfirmation":false}',
    );
    await handleTextMessage(USER, sender, 'สวัสดีครับ');
    expect(replies[0].text).toContain('ไม่พบ');
    expect(sessions.has('user-1|transaction')).toBe(false);
  });
});

describe('delete-last soft deletes the latest bot transaction', () => {
  it('ลบรายการล่าสุด reverts the balance', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: 'tx-last', amount: 85, fee: 0, type: 'expense', status: 'completed',
      accountId: 'acc-1', toAccountId: null, createdById: 'user-1', deletedAt: null,
    } as never);
    // softDeleteTransaction re-reads the tx inside the $transaction callback
    mockTx.transaction.findUnique.mockResolvedValue({
      id: 'tx-last', amount: 85, fee: 0, type: 'expense', status: 'completed',
      accountId: 'acc-1', toAccountId: null, createdById: 'user-1', deletedAt: null,
    });
    mockTx.transaction.update.mockImplementation(async (args: any) => ({
      id: 'tx-last', amount: 85, fee: 0, type: 'expense', description: 'ซื้อข้าวผัด', ...args.data,
    }));

    await handleTextMessage(USER, sender, 'ลบรายการล่าสุด');

    // soft delete sets deletedAt (no hard delete)
    expect(mockTx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tx-last' } }),
    );
    // reversal: expense revert → increment amount + fee
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 85 } },
    });
    expect(replies[0].text).toContain('ลบรายการแล้ว');
  });

  it('nothing to delete → guidance message', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);
    await handleTextMessage(USER, sender, 'ลบรายการล่าสุด');
    expect(replies[0].text).toContain('ไม่พบรายการ');
  });
});

describe('multiple accounts ask for selection', () => {
  it('asks which account and records after selection', async () => {
    const accounts = [
      { id: 'acc-1', name: 'กสิกร', alias: 'kbank', balance: 1000 },
      { id: 'acc-2', name: 'ท้องถิ่น', alias: null, balance: 500 },
    ];
    vi.mocked(prisma.account.findMany).mockResolvedValue(accounts as never);
    // findAccountByDisplay resolves by name via findFirst
    const findByName = async (args: any): Promise<never> =>
      (accounts.find((a) => a.name === args.where.OR[0].name) ?? null) as never;
    vi.mocked(prisma.account.findFirst).mockImplementation(findByName as never);
    aiChat.mockResolvedValue(
      '{"amount":85,"date":"2026-09-29","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","merchantName":null,"accountName":null,"confidence":0.95,"needsConfirmation":false}',
    );
    mockTx.transaction.create.mockImplementation(async (args: any) => ({ id: 'tx-3', ...args.data }));

    await handleTextMessage(USER, sender, 'ซื้อข้าวผัด 85 บาท');
    await handleTextMessage(USER, sender, 'ยืนยัน');
    await handleTextMessage(USER, sender, 'เลือกบัญชี:ท้องถิ่น');

    expect(replies[1].text).toContain('เลือกบัญชี');
    const createData = mockTx.transaction.create.mock.calls[0][0].data;
    expect(createData.accountId).toBe('acc-2');
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: { balance: { decrement: 85 } },
    });
  });
});