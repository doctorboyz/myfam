import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    // Restore group and its categories
    await prisma.$transaction(async (tx) => {
      await tx.category.updateMany({
        where: { groupId: id },
        data: {
          deletedAt: null,
          deletedById: null,
        },
      });

      await tx.categoryGroup.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
        },
      });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to restore group:', error);
    return apiError('Failed to restore group');
  }
}