import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser, parseId } from '@/lib/api';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const id = await parseId(props);
    const body = await request.json();

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) return apiError('Tag not found', 404);
    if (tag.userId !== currentUser.id && !currentUser.isAdmin) {
      return apiError('Not authorized', 403);
    }

    const name = (body.name || '').trim();
    if (!name) return apiError('Tag name is required', 400);

    const updated = await prisma.tag.update({
      where: { id },
      data: {
        name,
        color: body.color || null,
      },
    });

    return apiSuccess(updated);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      return apiError('Tag name already exists', 409);
    }
    console.error('Failed to update tag:', error);
    return apiError('Failed to update tag');
  }
}

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

    // Soft delete
    await prisma.tag.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: currentUser.id,
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete tag:', error);
    return apiError('Failed to delete tag');
  }
}