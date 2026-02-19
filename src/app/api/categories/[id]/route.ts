import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'groupId']);

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

    // Check if category is used in any transactions
    const usedCount = await prisma.transaction.count({
      where: { categoryId: id },
    });

    if (usedCount > 0) {
      return apiError(
        `Cannot delete this category because it is used in ${usedCount} transaction(s). You can rename it instead.`,
        409
      );
    }

    await prisma.category.delete({
      where: { id },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return apiError('Failed to delete category');
  }
}
