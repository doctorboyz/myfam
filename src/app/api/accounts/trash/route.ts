import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const accounts = await prisma.account.findMany({
      where: {
        deletedAt: { not: null },
        owner: { familyId: currentUser.familyId },
      },
      orderBy: { deletedAt: 'desc' },
      include: { owner: true },
    });

    return apiSuccess(accounts);
  } catch (error) {
    console.error('Failed to fetch trashed accounts:', error);
    return apiError('Failed to fetch trashed accounts');
  }
}