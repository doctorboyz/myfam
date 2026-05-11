import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields, getAuthUserId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'groupId']);

    const userId = await getAuthUserId();
    if (userId) {
      (data as Record<string, unknown>).updatedById = userId;
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data,
    });

    return apiSuccess(updatedCategory);
  } catch (error) {
    console.error('Failed to update category:', error);
    return apiError('Failed to update category');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const userId = await getAuthUserId();

    // Soft delete category
    await prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return apiError('Failed to delete category');
  }
}