import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) return apiError('Budget not found', 404);
    if (!budget.deletedAt) {
      return apiError('Budget must be soft-deleted before permanent deletion', 400);
    }

    // Transactions linked to this budget are cascade-deleted
    await prisma.budget.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to permanently delete budget:', error);
    return apiError('Failed to permanently delete budget');
  }
}