/**
 * POST /api/telegram/sandbox?key=<TELEGRAM_WEBHOOK_SECRET> — local dev harness.
 *
 * Simulates a Telegram update for a MyFam user without any network access:
 * replies are collected and returned instead of being sent. Lets us exercise
 * the whole pipeline ("ซื้อข้าวผัด 85 บาท" → ยืนยัน) with curl while the
 * tunnel/bot token isn't set up yet.
 *
 * Body: { type: 'text' | 'photo', userId: string, text?: string, photoBase64?: string }
 */

import { NextResponse } from 'next/server';
import { handleTelegramUpdate } from '@/lib/bot/handlers/router';
import type { BotSender, ReplyMarkup } from '@/lib/telegram/types';
import { verifyTelegramSecret } from '@/lib/telegram/verify';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SandboxReply {
  text: string;
  keyboard?: ReplyMarkup;
}

export async function POST(request: Request) {
  if (!verifyTelegramSecret(new URL(request.url).searchParams.get('key'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { type?: string; userId?: string; text?: string; photoBase64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.userId || (body.type !== 'text' && body.type !== 'photo')) {
    return NextResponse.json(
      { error: 'body must be { type: "text"|"photo", userId, text?, photoBase64? }' },
      { status: 400 },
    );
  }
  if (body.type === 'text' && !body.text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (body.type === 'photo' && !body.photoBase64) {
    return NextResponse.json({ error: 'photoBase64 is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  const replies: SandboxReply[] = [];
  const sender: BotSender = async (text, keyboard) => {
    replies.push({ text, keyboard });
  };

  // Simulate the update Telegram would deliver
  const fakeTelegramId = -1; // sandbox link for this MyFam user
  await prisma.telegramLink.upsert({
    where: { telegramUserId: String(fakeTelegramId) },
    create: { telegramUserId: String(fakeTelegramId), userId: user.id, displayName: 'Sandbox' },
    update: { userId: user.id, displayName: 'Sandbox' },
  });

  const update =
    body.type === 'text'
      ? {
          update_id: Date.now(),
          message: {
            message_id: Date.now(),
            from: { id: fakeTelegramId, first_name: 'Sandbox', is_bot: false },
            chat: { id: fakeTelegramId, type: 'private' as const, first_name: 'Sandbox' },
            date: Math.floor(Date.now() / 1000),
            text: body.text,
          },
        }
      : {
          update_id: Date.now(),
          message: {
            message_id: Date.now(),
            from: { id: fakeTelegramId, first_name: 'Sandbox', is_bot: false },
            chat: { id: fakeTelegramId, type: 'private' as const, first_name: 'Sandbox' },
            date: Math.floor(Date.now() / 1000),
            photo: [
              { file_id: body.photoBase64!, file_unique_id: 'sandbox', width: 512, height: 512 },
            ],
          },
        };

  const handled = await handleTelegramUpdate(update, () => sender, {
    photoBuffer: body.photoBase64 ? Buffer.from(body.photoBase64, 'base64') : undefined,
  });

  return NextResponse.json({ handled, replies });
}