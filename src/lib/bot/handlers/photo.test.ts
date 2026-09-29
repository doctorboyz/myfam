import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

/**
 * Photo (slip) flow tests: duplicate detection, disabled kill switch,
 * unreadable amounts, and the happy path storing slipImage + imageHash.
 */

const sessions = new Map<string, { id: string; userId: string; kind: string; step: string; payload: Record<string, unknown>; expiresAt: Date }>();

const mockTx = {
  transaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  account: { update: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(mockTx)),
    account: { findMany: vi.fn(), findFirst: vi.fn() },
    category: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), findFirst: vi.fn() },
    budget: { findMany: vi.fn() },
    botSession: {
      findUnique: vi.fn(async (args: any) => {
        const where = args.where;
        const key = `${where.userId_kind.userId}|${where.userId_kind.kind}`;
        const row = sessions.get(key);
        if (!row || row.expiresAt.getTime() < Date.now()) return null;
        return row;
      }),
      upsert: vi.fn(async (args: any) => {
        const create = args.create;
        const key = `${create.userId}|${create.kind}`;
        const row = { id: 'sess-1', ...create };
        sessions.set(key, row);
        return row;
      }),
      deleteMany: vi.fn(async (args: any) => {
        const where = args.where;
        const key = where.userId && where.kind
          ? `${where.userId}|${where.kind}`
          : where.userId_kind
            ? `${where.userId_kind.userId}|${where.userId_kind.kind}`
            : null;
        return { count: key && sessions.delete(key) ? 1 : 0 };
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

// No network: photo bytes are injected via prefetchedBuffer
vi.mock('@/lib/telegram/client', () => ({
  downloadPhoto: vi.fn(async () => {
    throw new Error('network disabled in tests');
  }),
  sendMessage: vi.fn(),
}));

// sharp: passthrough "resize"
vi.mock('sharp', () => ({
  default: (buf: unknown) => ({
    resize: () => ({ jpeg: () => ({ toBuffer: async () => buf }) }),
  }),
}));

const { handlePhotoMessage } = await import('./photo');
const { handleTextMessage } = await import('./text');
const { prisma } = await import('@/lib/prisma');

const USER = { id: 'user-1', name: 'Lita', role: 'child', familyId: 'fam-1' };
const PHOTO_BUFFER = Buffer.from('fake-jpeg-bytes');
const PHOTO_HASH = createHash('sha256').update(PHOTO_BUFFER).digest('hex');

let replies: { text: string; keyboard?: unknown }[] = [];
const sender = async (text: string, keyboard?: unknown) => {
  replies.push({ text, keyboard });
};

beforeEach(() => {
  vi.clearAllMocks();
  sessions.clear();
  replies = [];
  process.env.TELEGRAM_SLIP_ENABLED = 'true';

  vi.mocked(prisma.account.findMany).mockResolvedValue([
    { id: 'acc-1', name: 'กสิกร', alias: null, balance: 1000 },
  ] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1' }] as never);
  vi.mocked(prisma.category.findMany).mockResolvedValue([
    { id: 'cat-food', name: 'ค่าอาหาร', userId: null, group: { name: 'อาหาร', type: 'expense', deletedAt: null } },
  ] as never);
  vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
  aiChat.mockReset();
});

describe('photo flow', () => {
  it('kill switch off → degrade gracefully, no vision call', async () => {
    process.env.TELEGRAM_SLIP_ENABLED = 'false';
    await handlePhotoMessage(USER, sender, 'file-1', PHOTO_BUFFER);
    expect(replies[0].text).toContain('อ่านสลิปยังไม่เปิดใช้งาน');
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('duplicate slip hash → warning, nothing recorded', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      description: 'โอนเงิน', amount: 500, date: new Date('2026-09-29T03:00:00Z'),
    } as never);
    await handlePhotoMessage(USER, sender, 'file-1', PHOTO_BUFFER);
    expect(replies[0].text).toContain('บันทึกไปแล้ว');
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('unreadable amount (0) → missing-fields message, not saved', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);
    aiChat.mockResolvedValue(
      '{"amount":0,"date":"2026-09-29","description":"สลิป","type":"expense","categoryGroupName":"","confidence":0.3,"needsConfirmation":false}',
    );
    await handlePhotoMessage(USER, sender, 'file-1', PHOTO_BUFFER);
    expect(replies[0].text).toContain('ไม่พบ');
    expect(sessions.has('user-1|transaction')).toBe(false);
  });

  it('happy path: slip extracted → confirm → saved with slipImage', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);
    aiChat.mockResolvedValue(
      '{"amount":259,"date":"2026-09-29","description":"ค่ากาแฟ","type":"expense","categoryGroupName":"อาหาร","merchantName":"Starbucks","accountName":null,"confidence":0.9,"needsConfirmation":false}',
    );

    await handlePhotoMessage(USER, sender, 'file-1', PHOTO_BUFFER);
    expect(replies[0].text).toContain('ตรวจสอบรายการก่อนบันทึก');
    expect(replies[0].text).toContain('ค่ากาแฟ');
    expect(sessions.get('user-1|transaction')?.step).toBe('awaiting_confirm');

    // Confirm via the text handler — slip payload must survive
    mockTx.transaction.create.mockImplementation(async (args: any) => ({ id: 'tx-slip', ...args.data }));
    await handleTextMessage(USER, sender, 'ยืนยัน');

    const createData = mockTx.transaction.create.mock.calls[0][0].data;
    expect(createData.amount).toBe(259);
    expect(createData.imageHash).toBe(PHOTO_HASH);
    expect(String(createData.slipImage)).toBe(`data:image/jpeg;base64,${PHOTO_BUFFER.toString('base64')}`);
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { decrement: 259 } },
    });
    expect(replies[1].text).toContain('บันทึก');
  });
});