import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

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

    // Delete categories first, then group (atomic)
    await prisma.$transaction(async (tx) => {
      await tx.category.deleteMany({ where: { groupId: id } });
      await tx.categoryGroup.delete({ where: { id } });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete group:', error);
    return apiError('Failed to delete group');
  }
}
