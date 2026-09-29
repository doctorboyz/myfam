import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sandbox route tests:
 * - a user who already has a real Telegram link must reuse it —
 *   upserting the fake link keyed on telegramUserId hits unique(user_id)
 *   (this 500'd in production on the first direct-bound member)
 * - an unlinked user gets the throwaway sandbox link
 */

const handleTelegramUpdate = vi.fn(async () => true);

vi.mock('@/lib/bot/handlers/router', () => ({
  handleTelegramUpdate: (...args: unknown[]) => handleTelegramUpdate(...(args as [])),
  makeSender: vi.fn(),
}));

const userFindUnique = vi.fn();
const linkFindUnique = vi.fn();
const linkUpsert = vi.fn(async (...a: unknown[]) => {
  const args = a[0] as { create: { userId: string; telegramUserId: string } };
  // mirror the DB constraint: creating a second link for the same user fails
  const existing = linkFindUnique.mock.results[0]?.value as { userId: string } | null;
  if (existing && existing.userId === args.create.userId) {
    throw Object.assign(new Error('Unique constraint failed on the fields: (`user_id`)'), { code: 'P2002' });
  }
  return { telegramUserId: args.create.telegramUserId, userId: args.create.userId, displayName: 'Sandbox' };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...(a as [])) },
    telegramLink: {
      findUnique: (...a: unknown[]) => linkFindUnique(...(a as [])),
      upsert: (...a: unknown[]) => linkUpsert(...(a as [])),
    },
  },
}));

const { POST } = await import('./route');

const SECRET = 'test-webhook-secret';
const USER = { id: 'user-1', name: 'Lita', role: 'child', familyId: 'fam-1' };

function request(body: unknown) {
  return new Request(`http://localhost:3000/api/telegram/sandbox?key=${SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  userFindUnique.mockResolvedValue(USER);
  linkFindUnique.mockResolvedValue(null);
  handleTelegramUpdate.mockResolvedValue(true);
});

describe('POST /api/telegram/sandbox', () => {
  it('403 without the key', async () => {
    const res = await POST(new Request('http://localhost:3000/api/telegram/sandbox', {
      method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);
  });

  it('404 for an unknown user', async () => {
    userFindUnique.mockResolvedValue(null);
    const res = await POST(request({ type: 'text', userId: 'nobody', text: 'ดูยอด' }));
    expect(res.status).toBe(404);
  });

  it('reuses the existing real link instead of upserting a fake (no P2002)', async () => {
    // user already bound directly (e.g. via _link-telegram script) — linkFindUnique
    // (userId lookup) returns the real row; upsert must NOT be called
    linkFindUnique.mockResolvedValue({ telegramUserId: '8780951704', userId: USER.id });

    const res = await POST(request({ type: 'text', userId: USER.id, text: 'ดูยอด' }));

    expect(res.status).toBe(200);
    expect(linkUpsert).not.toHaveBeenCalled();
    // the simulated update carries the member's REAL telegram id
    const update = (handleTelegramUpdate.mock.calls[0] as unknown[])[0] as { message: { from: { id: number } } };
    expect(update.message.from.id).toBe(8780951704);
    const json = await res.json();
    expect(json.handled).toBe(true);
  });

  it('attaches the throwaway sandbox link for an unlinked user', async () => {
    linkFindUnique.mockResolvedValue(null);
    const res = await POST(request({ type: 'text', userId: USER.id, text: 'ดูยอด' }));

    expect(res.status).toBe(200);
    expect(linkUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = (linkUpsert.mock.calls[0] as unknown[])[0] as { create: { userId: string } };
    expect(upsertArgs.create.userId).toBe(USER.id);
  });
});