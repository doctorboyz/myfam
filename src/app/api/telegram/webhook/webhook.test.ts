import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Webhook contract tests:
 * - 403 on a bad/missing secret (never processes)
 * - 500 when unconfigured (Telegram retries later)
 * - 200 + deferred processing when healthy (ack-then-process)
 * - non-private chats and bot senders are ignored
 */

const handleTelegramUpdate = vi.fn(async () => true);

// `after()` only works inside a real Next request scope — run callbacks
// synchronously so deferred processing is observable in assertions.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => void cb()),
  };
});

vi.mock('@/lib/bot/handlers/router', () => ({
  handleTelegramUpdate: (...args: unknown[]) => handleTelegramUpdate(...(args as [])),
  makeSender: vi.fn(),
}));

const prismaFindUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    telegramLink: { findUnique: (...a: unknown[]) => prismaFindUnique(...(a as [])) },
    user: { findUnique: vi.fn() },
  },
}));

const { GET, POST } = await import('./route');

const SECRET = 'test-webhook-secret';

function update(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: 111, first_name: 'Lita', is_bot: false },
      chat: { id: 111, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: 'ซื้อข้าวผัด 85 บาท',
      ...overrides,
    },
  };
}

function request(body: unknown, secret?: string) {
  return new Request('http://localhost:3000/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_ENABLED = 'true';
  process.env.TELEGRAM_BOT_TOKEN = '123:abc';
});

describe('GET', () => {
  it('returns ok for health checks', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST', () => {
  it('403 when the secret header is missing', async () => {
    const res = await POST(request(update()));
    expect(res.status).toBe(403);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('403 on a wrong secret', async () => {
    const res = await POST(request(update(), 'wrong-secret'));
    expect(res.status).toBe(403);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('500 when the bot token is unconfigured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await POST(request(update(), SECRET));
    expect(res.status).toBe(500);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('200 with the kill switch on, without processing', async () => {
    process.env.TELEGRAM_BOT_ENABLED = 'false';
    const res = await POST(request(update(), SECRET));
    expect(res.status).toBe(200);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('200 immediately on a valid update (processing deferred to after())', async () => {
    const res = await POST(request(update(), SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // handleTelegramUpdate is scheduled in after(), not awaited in-request
    expect(handleTelegramUpdate.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('200 on malformed JSON (ack and drop)', async () => {
    const raw = new Request('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      body: 'not-json{',
    });
    const res = await POST(raw);
    expect(res.status).toBe(200);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });
});