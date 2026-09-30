import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, getAuthUser } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const category = await prisma.category.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });

    return apiSuccess(category);
  } catch (error) {
    console.error('Failed to restore category:', error);
    return apiError('Failed to restore category');
  }
}