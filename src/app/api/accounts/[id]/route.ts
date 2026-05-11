import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields, getAuthUserId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'type', 'balance', 'color', 'icon', 'accountNo', 'alias', 'status']);

    const userId = await getAuthUserId();
    if (userId) {
      (data as Record<string, unknown>).updatedById = userId;
    }

    const account = await prisma.account.update({
      where: { id },
      data,
    });

    return apiSuccess(account);
  } catch (error) {
    console.error('Failed to update account:', error);
    return apiError('Failed to update account');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const userId = await getAuthUserId();

    // Soft delete: set deletedAt and deletedById
    await prisma.account.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return apiError('Failed to delete account');
  }
}