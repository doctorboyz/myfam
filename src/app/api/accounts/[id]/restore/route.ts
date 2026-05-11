import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const account = await prisma.account.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });

    return apiSuccess(account);
  } catch (error) {
    console.error('Failed to restore account:', error);
    return apiError('Failed to restore account');
  }
}