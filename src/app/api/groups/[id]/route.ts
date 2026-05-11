import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, getAuthUserId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const { name } = await request.json();

    const updatedGroup = await prisma.categoryGroup.update({
      where: { id },
      data: { name },
    });

    return apiSuccess(updatedGroup);
  } catch (error) {
    console.error('Failed to update group:', error);
    return apiError('Failed to update group');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const userId = await getAuthUserId();

    // Soft delete group and its categories
    await prisma.$transaction(async (tx) => {
      await tx.category.updateMany({
        where: { groupId: id },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
        },
      });

      await tx.categoryGroup.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
        },
      });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete group:', error);
    return apiError('Failed to delete group');
  }
}