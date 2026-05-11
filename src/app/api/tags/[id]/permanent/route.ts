import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) return apiError('Tag not found', 404);
    if (!tag.deletedAt) {
      return apiError('Tag must be soft-deleted before permanent deletion', 400);
    }

    await prisma.tag.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to permanently delete tag:', error);
    return apiError('Failed to permanently delete tag');
  }
}