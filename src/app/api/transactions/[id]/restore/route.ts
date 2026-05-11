import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { id } });
      if (!existing) throw new Error('Transaction not found');

      // Restore the transaction
      const restored = await tx.transaction.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
        },
      });

      // Re-apply balance changes for completed transactions
      if (restored.status === 'completed' && restored.accountId) {
        const amount = Number(restored.amount);
        const fee = restored.fee ? Number(restored.fee) : 0;

        if (restored.type === 'income') {
          await tx.account.update({
            where: { id: restored.accountId },
            data: { balance: { increment: amount - fee } },
          });
        } else {
          await tx.account.update({
            where: { id: restored.accountId },
            data: { balance: { decrement: amount + fee } },
          });
        }

        if (restored.type === 'transfer' && restored.toAccountId) {
          await tx.account.update({
            where: { id: restored.toAccountId },
            data: { balance: { increment: amount } },
          });
        }
      }

      return restored;
    });

    return apiSuccess(transaction);
  } catch (error) {
    console.error('Failed to restore transaction:', error);
    return apiError('Failed to restore transaction');
  }
}