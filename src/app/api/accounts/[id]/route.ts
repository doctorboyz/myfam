import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'type', 'balance', 'color', 'accountNo', 'status']);

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
    await prisma.account.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return apiError('Failed to delete account');
  }
}
