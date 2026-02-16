import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUserId } from '@/lib/api';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const userId = await getAuthUserId();

    if (!userId) {
      return apiError('Not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        isAdmin: true,
        avatar: true,
        color: true,
        familyId: true,
      },
    });

    if (!user) {
      const cookieStore = await cookies();
      cookieStore.delete('userId');
      return apiError('User not found', 401);
    }

    return apiSuccess(user);
  } catch (error) {
    console.error('Auth check error:', error);
    return apiError('Auth check failed');
  }
}
