/**
 * Update router: resolves the TelegramLink, filters to private chats,
 * handles /start binding + /unlink, then dispatches text/photo.
 * Everything flows through the BotSender abstraction — no direct
 * Telegram client calls here, so tests never touch the network.
 */

import { prisma } from '@/lib/prisma';
import { sendMessage } from '@/lib/telegram/client';
import type { BotSender, TelegramUpdate } from '@/lib/telegram/types';
import { detectCommand, parseStartCode } from '../commands';
import { bindTelegramUser, UNLINKED_GREETING } from '../link';
import { truncateMessage } from '../format';
import type { BotUser } from '../record';
import { handlePhotoMessage } from './photo';
import { handleTextMessage } from './text';

/** Build the production sender bound to a chat id. */
export function makeSender(chatId: number | string): BotSender {
  return async (text, keyboard) => {
    await sendMessage(chatId, text, keyboard);
  };
}

/** Resolve a Telegram user id to a MyFam BotUser, or null when unlinked. */
async function resolveLinkedUser(telegramUserId: number): Promise<BotUser | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { telegramUserId: String(telegramUserId) },
    include: { user: true },
  });
  if (!link) return null;

  return {
    id: link.user.id,
    name: link.user.name,
    role: link.user.role,
    familyId: link.user.familyId,
  };
}

/** Options that let the sandbox inject data it can't fetch over the network. */
export interface UpdateOptions {
  /** Sandbox: photo bytes provided directly, skipping the Telegram download. */
  photoBuffer?: Buffer;
}

/**
 * Route one Telegram update. Returns true when the update was handled.
 * Never throws — errors are reported to the user where possible.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  senderFactory: (chatId: number | string) => BotSender,
  options: UpdateOptions = {},
): Promise<boolean> {
  const message = update.message ?? update.edited_message;
  if (!message || !message.from || message.from.is_bot) return false;

  // Private chats only — group/supergroup/channel messages are ignored
  if (message.chat.type !== 'private') return false;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const displayName = message.from.first_name ?? message.from.username ?? null;
  const sender = senderFactory(chatId);

  const command = message.text ? detectCommand(message.text) : 'none';

  // /start <code> — binding works even before a link exists
  if (command === 'start') {
    const code = parseStartCode(message.text ?? '');
    if (!code) {
      const user = await resolveLinkedUser(telegramUserId);
      await sender(
        user
          ? '🎉 คุณเชื่อมต่อกับ MyFam อยู่แล้ว — พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่ง'
          : UNLINKED_GREETING,
      );
      return true;
    }
    const result = await bindTelegramUser(String(telegramUserId), code, displayName);
    await sender(truncateMessage(result.message));
    return true;
  }

  // /unlink — remove the link (only needs the Telegram id)
  if (command === 'unlink') {
    const existing = await prisma.telegramLink.findUnique({
      where: { telegramUserId: String(telegramUserId) },
    });
    if (!existing) {
      await sender('ยังไม่ได้เชื่อมต่อกับ MyFam — ส่ง /start <รหัสเชื่อมต่อ> เพื่อเริ่ม');
      return true;
    }
    await prisma.telegramLink.delete({ where: { telegramUserId: String(telegramUserId) } });
    await sender('🔌 ยกเลิกการเชื่อมต่อกับ MyFam แล้ว\nส่ง /start <รหัสเชื่อมต่อ> เพื่อเชื่อมใหม่ได้ทุกเมื่อ');
    return true;
  }

  // Everything else requires a link
  const user = await resolveLinkedUser(telegramUserId);
  if (!user) {
    await sender(UNLINKED_GREETING);
    return true;
  }

  try {
    // Photo (slip) — photo array sorted by size; last = largest
    if (message.photo && message.photo.length > 0) {
      await handlePhotoMessage(
        user,
        sender,
        message.photo[message.photo.length - 1].file_id,
        options.photoBuffer,
      );
      return true;
    }

    const text = message.text ?? message.caption ?? '';
    if (text) {
      await handleTextMessage(user, sender, text);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[TelegramRouter] Handler error:', error);
    try {
      await sender('❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง หรือบันทึกผ่านเว็บแอป MyFam');
    } catch {
      // sending failed too — nothing more we can do
    }
    return true;
  }
}