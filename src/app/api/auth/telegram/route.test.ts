import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const h = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  setCookie: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'userId' && h.cookieValue ? { value: h.cookieValue } : undefined,
    set: h.setCookie,
  })),
}));

const mockPrisma = vi.hoisted(() => ({
  telegramLink: { findUnique: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const { POST } = await import('./route');

const BOT_TOKEN = '123456:TEST-TOKEN';
vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);

const NOW = Math.floor(Date.UTC(2026, 8, 30, 0, 0, 0) / 1000);

/** Build a signed initData payload the same way Telegram does. */
function makeInitData(fields: Record<string, string>, user: object): string {
  const params = new URLSearchParams({
    ...fields,
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

const TG_USER = { id: 987654321, first_name: 'Lita' };

const LINKED_USER = {
  id: 'u1',
  name: 'Lita',
  role: 'child',
  isAdmin: false,
  avatar: null,
  color: '#ff0000',
  familyId: 'fam1',
};

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/telegram — Mini App login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00Z'));
  });

  it('logs in a linked Telegram user and sets the session cookie', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      user: LINKED_USER,
    });

    const res = await POST(makeReq({ initData: makeInitData({ auth_date: String(NOW) }, TG_USER) }));
    expect(res.status).toBe(200);

    expect(mockPrisma.telegramLink.findUnique).toHaveBeenCalledWith({
      where: { telegramUserId: '987654321' },
      include: { user: true },
    });
    expect(h.setCookie).toHaveBeenCalledWith(
      'userId',
      'u1',
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
    );
  });

  it('rejects an invalid signature', async () => {
    const params = new URLSearchParams({
      auth_date: String(NOW),
      user: JSON.stringify(TG_USER),
      hash: 'deadbeef'.repeat(8),
    });

    const res = await POST(makeReq({ initData: params.toString() }));
    expect(res.status).toBe(401);
    expect(mockPrisma.telegramLink.findUnique).not.toHaveBeenCalled();
    expect(h.setCookie).not.toHaveBeenCalled();
  });

  it('rejects an unlinked Telegram account with a 403 (not 401)', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({ initData: makeInitData({ auth_date: String(NOW) }, TG_USER) }));
    expect(res.status).toBe(403);
    expect(h.setCookie).not.toHaveBeenCalled();
  });

  it('returns 400 when initData is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});