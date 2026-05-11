import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

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