import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const budget = await prisma.budget.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });

    return apiSuccess(budget);
  } catch (error) {
    console.error('Failed to restore budget:', error);
    return apiError('Failed to restore budget');
  }
}