/**
 * Telegram Mini App initData validation.
 *
 * When the webapp is opened from inside Telegram (bot menu button etc.),
 * Telegram injects `telegram-web-app.js` and provides `WebApp.initData` —
 * a signed URL-encoded payload proving which Telegram user opened the app.
 * Signature scheme (per Telegram docs):
 *   secret_key   = HMAC-SHA256(key="WebAppData", data=<bot_token>)
 *   data_check   = all key=value pairs sorted by key, joined with "\n",
 *                  excluding the `hash` entry
 *   client_hash  = HMAC-SHA256(key=secret_key, data=data_check) hex
 *
 * If the hash matches, the payload genuinely came from Telegram for this
 * bot — we can trust its `user.id` and log that person in without a password.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Reject initData older than this — blocks replaying a captured payload. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { now?: number; maxAgeSeconds?: number } = {}
): TelegramInitUser | null {
  const { now = Date.now(), maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS } = options;
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!hash || !authDate) return null;

  if (now / 1000 - authDate > maxAgeSeconds) return null;

  // data_check_string: every field except hash, sorted by key, k=v joined by \n
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null') as TelegramInitUser | null;
    if (!user || typeof user.id !== 'number') return null;
    return user;
  } catch {
    return null;
  }
}