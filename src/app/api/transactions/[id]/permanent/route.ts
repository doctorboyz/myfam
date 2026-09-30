import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, getAuthUser } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);
    if (currentUser.role !== 'parent' && !currentUser.isAdmin) {
      return apiError('Not authorized', 403);
    }

    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) return apiError('Transaction not found', 404);
    if (!transaction.deletedAt) {
      return apiError('Transaction must be soft-deleted before permanent deletion', 400);
    }

    // TransactionTags are cascade-deleted
    await prisma.transaction.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to permanently delete transaction:', error);
    return apiError('Failed to permanently delete transaction');
  }
}