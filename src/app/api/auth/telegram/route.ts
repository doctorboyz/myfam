import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';
import { cookies } from 'next/headers';
import { verifyTelegramInitData } from '@/lib/telegram/init-data';

/**
 * Telegram Mini App login: the client posts WebApp.initData (signed by
 * Telegram). If the signature is valid and the Telegram account is linked
 * to a My Fam user (TelegramLink), issue the same session cookie as the
 * password login — no password needed inside Telegram.
 */
export async function POST(request: Request) {
  try {
    const { initData } = await request.json();

    if (typeof initData !== 'string' || !initData) {
      return apiError('initData is required', 400);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return apiError('Telegram login is not configured', 503);
    }

    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser) {
      return apiError('Invalid or expired Telegram credentials', 401);
    }

    const link = await prisma.telegramLink.findUnique({
      where: { telegramUserId: String(tgUser.id) },
      include: { user: true },
    });
    if (!link || !link.user) {
      return apiError('Telegram account ยังไม่ได้เชื่อมต่อกับ My Fam (ส่ง /link ในบอท)', 403);
    }

    const cookieStore = await cookies();
    cookieStore.set('userId', link.userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    const user = link.user;
    return apiSuccess({
      id: user.id,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
      avatar: user.avatar,
      color: user.color,
      familyId: user.familyId,
    });
  } catch (error) {
    console.error('Telegram login error:', error);
    return apiError('Telegram login failed');
  }
}