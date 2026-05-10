import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser, parseId } from '@/lib/api';

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const id = await parseId(props);

    // Only the tag owner or admin can delete
    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) return apiError('Tag not found', 404);
    if (tag.userId !== currentUser.id && !currentUser.isAdmin) {
      return apiError('Not authorized', 403);
    }

    await prisma.tag.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error('Failed to delete tag:', error);
    return apiError('Failed to delete tag');
  }
}