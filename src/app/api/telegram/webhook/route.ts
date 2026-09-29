/**
 * POST /api/telegram/webhook — Telegram bot entry point.
 *
 * Contract:
 * - 403 when the secret header doesn't match (never leak whether configured)
 * - 500 when the bot is unconfigured, so Telegram retries later
 * - otherwise always 200 and the real work happens in `after()`:
 *   Cloudflare/Next cuts the request at ~100s and vision extraction can take
 *   30–90s, so we must never await AI inside the request lifecycle.
 */

import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { handleTelegramUpdate, makeSender } from '@/lib/bot/handlers/router';
import { verifyTelegramSecret } from '@/lib/telegram/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Kill switch — ack (200) but do nothing, so Telegram stops retrying
  if (process.env.TELEGRAM_BOT_ENABLED === 'false') {
    return NextResponse.json({ ok: true });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    // Unconfigured — 500 so Telegram retries once the token exists
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    // Malformed body — ack and drop; retrying won't help
    return NextResponse.json({ ok: true });
  }

  // Ack immediately; process after the response is flushed.
  // Errors are caught inside handleTelegramUpdate — never rethrow here,
  // a non-2xx would make Telegram re-send the same update forever.
  after(async () => {
    try {
      await handleTelegramUpdate(update as never, makeSender);
    } catch (error) {
      console.error('[TelegramWebhook] Unhandled error:', error);
    }
  });

  return NextResponse.json({ ok: true });
}