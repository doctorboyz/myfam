import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyTelegramInitData } from './init-data';

const BOT_TOKEN = '123456:TEST-TOKEN';

/** Build a signed initData payload the same way Telegram does. */
function makeInitData(
  fields: Record<string, string>,
  token = BOT_TOKEN,
  hash?: string
): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const computed =
    hash ?? createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', computed);
  return params.toString();
}

const NOW = Date.UTC(2026, 8, 30, 0, 0, 0);

describe('verifyTelegramInitData', () => {
  it('accepts a correctly signed payload and returns the Telegram user', () => {
    const initData = makeInitData({
      auth_date: String(Math.floor(NOW / 1000)),
      query_id: 'AAF1',
      user: JSON.stringify({ id: 987654321, first_name: 'Lita' }),
    });

    const user = verifyTelegramInitData(initData, BOT_TOKEN, { now: NOW });
    expect(user).toEqual({ id: 987654321, first_name: 'Lita' });
  });

  it('rejects a payload signed for a different bot', () => {
    const initData = makeInitData(
      { auth_date: String(Math.floor(NOW / 1000)), user: JSON.stringify({ id: 1 }) },
      '999999:OTHER-BOT'
    );

    expect(verifyTelegramInitData(initData, BOT_TOKEN, { now: NOW })).toBeNull();
  });

  it('rejects a tampered field (amount edited after signing)', () => {
    const signed = makeInitData({
      auth_date: String(Math.floor(NOW / 1000)),
      user: JSON.stringify({ id: 1 }),
    });
    const params = new URLSearchParams(signed);
    params.set('user', JSON.stringify({ id: 2 })); // swap identity
    const tampered = params.toString();

    expect(verifyTelegramInitData(tampered, BOT_TOKEN, { now: NOW })).toBeNull();
  });

  it('rejects a replayed payload older than the max age', () => {
    const initData = makeInitData({
      auth_date: String(Math.floor(NOW / 1000) - 25 * 60 * 60), // 25h old
      user: JSON.stringify({ id: 1 }),
    });

    expect(verifyTelegramInitData(initData, BOT_TOKEN, { now: NOW })).toBeNull();
  });

  it('rejects payloads without a hash or user', () => {
    const noHash = new URLSearchParams({ auth_date: '1' }).toString();
    expect(verifyTelegramInitData(noHash, BOT_TOKEN, { now: NOW })).toBeNull();

    const noUser = makeInitData({ auth_date: String(Math.floor(NOW / 1000)) });
    expect(verifyTelegramInitData(noUser, BOT_TOKEN, { now: NOW })).toBeNull();
  });
});