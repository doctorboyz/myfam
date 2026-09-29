/**
 * Verify the Telegram webhook secret header (X-Telegram-Bot-Api-Secret-Token)
 * using a constant-time comparison.
 */

import { timingSafeEqual } from 'crypto';

export function verifyTelegramSecret(header: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(secret);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}