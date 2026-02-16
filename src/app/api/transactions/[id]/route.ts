import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id } });
      if (!transaction) throw new Error('Transaction not found');

      // Only revert balances for completed transactions (not planned/void)
      if (transaction.status === 'completed' && transaction.accountId) {
        const amount = Number(transaction.amount);
        const fee = transaction.fee ? Number(transaction.fee) : 0;

        // Revert source account balance (mirror of create logic)
        if (transaction.type === 'income') {
          await tx.account.update({
            where: { id: transaction.accountId },
            data: { balance: { decrement: amount - fee } },
          });
        } else {
          await tx.account.update({
            where: { id: transaction.accountId },
            data: { balance: { increment: amount + fee } },
          });
        }

        // Revert destination account (transfer)
        if (transaction.type === 'transfer' && transaction.toAccountId) {
          await tx.account.update({
            where: { id: transaction.toAccountId },
            data: { balance: { decrement: amount } },
          });
        }
      }

      await tx.transaction.delete({ where: { id } });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    return apiError('Failed to delete transaction');
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();

    // Fetch existing transaction to detect status transitions
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return apiError('Transaction not found', 404);

    const isCompletingPlanned =
      existing.status === 'planned' && body.status === 'completed';

    if (isCompletingPlanned) {
      // Planned → Completed: set actual amount, account, and adjust balances
      const result = await prisma.$transaction(async (tx) => {
        const actualAmount = body.amount != null ? Number(body.amount) : Number(existing.planAmount || 0);
        const fee = body.fee != null ? Number(body.fee) : (existing.fee ? Number(existing.fee) : 0);
        const accountId = body.accountId || existing.accountId;
        const toAccountId = body.toAccountId || existing.toAccountId;

        const updated = await tx.transaction.update({
          where: { id },
          data: {
            status: 'completed',
            amount: actualAmount,
            accountId,
            toAccountId: toAccountId || null,
            description: body.description ?? existing.description,
            date: body.date ? new Date(body.date) : existing.date,
          },
          include: {
            category: { include: { group: true } },
            account: true,
            toAccount: true,
          },
        });

        // Adjust account balances
        if (accountId) {
          if (existing.type === 'income') {
            await tx.account.update({
              where: { id: accountId },
              data: { balance: { increment: actualAmount - fee } },
            });
          } else {
            await tx.account.update({
              where: { id: accountId },
              data: { balance: { decrement: actualAmount + fee } },
            });
          }

          if (existing.type === 'transfer' && toAccountId) {
            await tx.account.update({
              where: { id: toAccountId },
              data: { balance: { increment: actualAmount } },
            });
          }
        }

        return updated;
      });

      return apiSuccess(result);
    }

    // Standard update (non-status-transition)
    const data = pickFields(body, [
      'description', 'tags', 'slipImage', 'status',
      'categoryId', 'date', 'note', 'planAmount',
    ]);

    const transaction = await prisma.transaction.update({
      where: { id },
      data,
    });

    return apiSuccess(transaction);
  } catch (error) {
    console.error('Failed to update transaction:', error);
    return apiError('Failed to update transaction');
  }
}
