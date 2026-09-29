/**
 * Telegram ↔ MyFam account binding.
 * Binding happens via "/start <inviteCode>" — the parent mints a code
 * in the web app (settings/family → /api/telegram/link-code).
 * Reuses the previously-unused InviteCode model.
 */

import { prisma } from '@/lib/prisma';
import { truncateMessage } from './format';

export interface LinkResult {
  ok: boolean;
  message: string;
}

/**
 * Bind a Telegram user to a MyFam user using an invite code.
 * Conflict checks mirror the old LINE link route: 404/409/410 semantics.
 */
export async function bindTelegramUser(
  telegramUserId: string,
  code: string,
  displayName: string | null,
): Promise<LinkResult> {
  const invite = await prisma.inviteCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { user: true },
  });

  if (!invite) {
    return { ok: false, message: '❌ ไม่พบรหัสเชื่อมต่อ — ขอรหัสใหม่จากผู้ปกครองได้ที่หน้า "สมาชิกครอบครัว" ในแอป MyFam' };
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: '⌛ รหัสเชื่อมต่อหมดอายุแล้ว — ขอรหัสใหม่จากผู้ปกครองได้' };
  }

  if (invite.usedAt) {
    return { ok: false, message: '❌ รหัสนี้ถูกใช้ไปแล้ว — ขอรหัสใหม่ได้ที่หน้า "สมาชิกครอบครัว" ในแอป MyFam' };
  }

  // This MyFam user is already linked to a different Telegram account
  const existingByUser = await prisma.telegramLink.findUnique({
    where: { userId: invite.userId },
  });
  if (existingByUser && existingByUser.telegramUserId !== telegramUserId) {
    return { ok: false, message: '⚠️ สมาชิกคนนี้เชื่อมกับ Telegram อื่นอยู่แล้ว — ยกเลิกการเชื่อมเดิมก่อน (/unlink จาก Telegram เดิม)' };
  }

  // This Telegram account is already linked to a different MyFam user
  const existingByTelegram = await prisma.telegramLink.findUnique({
    where: { telegramUserId },
  });
  if (existingByTelegram && existingByTelegram.userId !== invite.userId) {
    return { ok: false, message: '⚠️ Telegram นี้เชื่อมกับสมาชิกคนอื่นอยู่แล้ว — พิมพ์ /unlink ก่อนเพื่อยกเลิกการเชื่อมเดิม' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.telegramLink.upsert({
      where: { telegramUserId },
      create: {
        telegramUserId,
        userId: invite.userId,
        displayName: displayName ?? null,
      },
      update: { userId: invite.userId, displayName: displayName ?? null },
    });

    await tx.inviteCode.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
  });

  const name = invite.user.displayName || invite.user.name;
  return {
    ok: true,
    message: truncateMessage(
      `🎉 เชื่อมต่อสำเร็จ! สวัสดี ${name}\n\nตอนนี้บันทึกเงินผ่าน Telegram ได้แล้ว:\n📝 "ซื้อข้าวผัด 85 บาท" — บันทึกรายการ\n📊 ดูยอด\n📈 สรุปเดือนนี้\n📸 ส่งรูปสลิปได้เลย\n\nพิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด`
    ),
  };
}

/** Greeting/help shown to unlinked Telegram users. */
export const UNLINKED_GREETING = `🤖 MyFam Bot — ผู้ช่วยจัดการเงินครอบครัว

ยังไม่ได้เชื่อมต่อกับบัญชี MyFam 🔗

ให้ผู้ปกครองกดปุ่ม "รหัส Telegram" ข้างชื่อของคุณที่หน้า สมาชิกครอบครัว ในแอป MyFam แล้วส่งคำสั่งนี้มา:

/start <รหัสเชื่อมต่อ>`;