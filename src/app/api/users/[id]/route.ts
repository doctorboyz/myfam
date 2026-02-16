import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'role', 'color', 'avatar']);

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    return apiSuccess(updatedUser);
  } catch (error) {
    console.error('Failed to update user:', error);
    return apiError('Failed to update user');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    await prisma.user.delete({
      where: { id },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return apiError('Failed to delete user');
  }
}
