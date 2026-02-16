import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, getAuthUserId, pickFields } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();

    // Authorization: only creator can edit
    const userId = await getAuthUserId();
    if (userId) {
      const existing = await prisma.budget.findUnique({ where: { id } });
      if (existing && existing.createdById !== userId) {
        return apiError('Only the creator can edit this budget', 403);
      }
    }

    const data = pickFields(body, ['title', 'description', 'limit', 'period', 'startDate', 'endDate', 'icon', 'color']);

    const updatedBudget = await prisma.budget.update({
      where: { id },
      data,
    });

    return apiSuccess(updatedBudget);
  } catch (error) {
    console.error('Failed to update budget:', error);
    return apiError('Failed to update budget');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    // Archive budget and void pending transactions
    await prisma.$transaction(async (tx) => {
      await tx.budget.update({
        where: { id },
        data: { status: 'archived' },
      });

      await tx.transaction.updateMany({
        where: {
          budgetId: id,
          status: { in: ['pending', 'planned'] },
        },
        data: {
          status: 'void',
        },
      });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete budget:', error);
    return apiError('Failed to delete budget');
  }
}
