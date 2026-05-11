import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) return apiError('Category not found', 404);
    if (!category.deletedAt) {
      return apiError('Category must be soft-deleted before permanent deletion', 400);
    }

    await prisma.category.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to permanently delete category:', error);
    return apiError('Failed to permanently delete category');
  }
}