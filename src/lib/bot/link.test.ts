import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Telegram ↔ MyFam binding tests: /start <code> flows and conflict checks.
 */

const inviteCodes = new Map<string, { id: string; code: string; userId: string; expiresAt: Date; usedAt: Date | null }>();
const telegramLinks = new Map<string, { telegramUserId: string; userId: string; displayName: string | null }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    inviteCode: {
      findUnique: vi.fn(async (args: any) => {
        const where = args.where;
        if (where.code) return inviteCodes.get(where.code) ?? null;
        if (where.userId) {
          for (const ic of inviteCodes.values()) if (ic.userId === where.userId) return ic;
          return null;
        }
        return null;
      }),
    },
    telegramLink: {
      findUnique: vi.fn(async (args: any) => {
        const where = args.where;
        if (where.telegramUserId) return telegramLinks.get(where.telegramUserId) ?? null;
        if (where.userId) {
          for (const l of telegramLinks.values()) if (l.userId === where.userId) return l;
          return null;
        }
        return null;
      }),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (cb: any) =>
      cb({
        telegramLink: {
          upsert: vi.fn(async (args: any) => {
            const where = args.where;
            const create = args.create;
            const existing = telegramLinks.get(where.telegramUserId);
            const row = { telegramUserId: create.telegramUserId, userId: create.userId, displayName: create.displayName };
            telegramLinks.set(row.telegramUserId, row);
            return { ...row, existed: !!existing };
          }),
        },
        inviteCode: {
          update: vi.fn(async (args: any) => {
            const where = args.where;
            // inviteCodes is keyed by code — look the row up by id
            for (const ic of inviteCodes.values()) {
              if (ic.id === where.id) {
                ic.usedAt = new Date();
                return ic;
              }
            }
            return null;
          }),
        },
      }),
    ),
  },
}));

const { bindTelegramUser } = await import('./link');

const T_ID = '111222333';
const CODE = 'ABCD23';
const OTHER_T_ID = '999888777';

function seedInvite(overrides: Record<string, unknown> = {}) {
  inviteCodes.set(CODE, {
    id: 'invite-1',
    code: CODE,
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    usedAt: null,
    user: { displayName: 'ลูกสาว', name: 'lita' },
    ...overrides,
  } as never);
}

beforeEach(() => {
  inviteCodes.clear();
  telegramLinks.clear();
  vi.clearAllMocks();
});

describe('bindTelegramUser', () => {
  it('binds with a valid unused code', async () => {
    seedInvite();
    const result = await bindTelegramUser(T_ID, CODE.toLowerCase(), 'Lita');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('เชื่อมต่อสำเร็จ');
    expect(inviteCodes.get(CODE)!.usedAt).not.toBeNull();
  });

  it('rejects an unknown code', async () => {
    const result = await bindTelegramUser(T_ID, 'NOPE99', null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ไม่พบรหัสเชื่อมต่อ');
  });

  it('rejects an expired code', async () => {
    seedInvite({ expiresAt: new Date(Date.now() - 1000) });
    const result = await bindTelegramUser(T_ID, CODE, null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('หมดอายุ');
  });

  it('rejects an already-used code', async () => {
    seedInvite({ usedAt: new Date() });
    const result = await bindTelegramUser(T_ID, CODE, null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ใช้ไปแล้ว');
  });

  it('rejects when the MyFam user is linked to another Telegram account', async () => {
    seedInvite();
    telegramLinks.set(OTHER_T_ID, { telegramUserId: OTHER_T_ID, userId: 'user-1', displayName: null });
    const result = await bindTelegramUser(T_ID, CODE, null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Telegram อื่น');
  });

  it('rejects when this Telegram account is linked to another MyFam user', async () => {
    seedInvite({ userId: 'user-1' });
    telegramLinks.set(T_ID, { telegramUserId: T_ID, userId: 'user-2', displayName: null });
    const result = await bindTelegramUser(T_ID, CODE, null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('สมาชิกคนอื่น');
  });

  it('rebinding the same pair succeeds (upsert path)', async () => {
    seedInvite();
    telegramLinks.set(T_ID, { telegramUserId: T_ID, userId: 'user-1', displayName: 'Old Name' });
    const result = await bindTelegramUser(T_ID, CODE, 'New Name');
    expect(result.ok).toBe(true);
  });
});