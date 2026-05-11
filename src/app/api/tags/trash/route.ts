import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const tags = await prisma.tag.findMany({
      where: {
        deletedAt: { not: null },
        familyId: currentUser.familyId,
      },
      orderBy: { deletedAt: 'desc' },
    });

    return apiSuccess(tags);
  } catch (error) {
    console.error('Failed to fetch trashed tags:', error);
    return apiError('Failed to fetch trashed tags');
  }
}