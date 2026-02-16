import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return apiError('accountId is required', 400);
  }

  try {
    const reconciliations = await prisma.reconciliation.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(reconciliations);
  } catch (error) {
    console.error('Failed to fetch reconciliations:', error);
    return apiError('Failed to fetch reconciliations');
  }
}

export async function POST(request: Request) {
  try {
    const { accountId, newBalance, performedById, note } = await request.json();

    if (!accountId || newBalance === undefined || !performedById) {
      return apiError('accountId, newBalance, and performedById are required', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new Error('Account not found');

      const previousBalance = Number(account.balance);
      const newBal = Number(newBalance);
      const difference = newBal - previousBalance;

      const reconciliation = await tx.reconciliation.create({
        data: {
          accountId,
          previousBalance,
          newBalance: newBal,
          difference,
          note: note || null,
          performedById,
        },
      });

      await tx.account.update({
        where: { id: accountId },
        data: { balance: newBal },
      });

      return reconciliation;
    });

    return apiSuccess(result, 201);
  } catch (error) {
    console.error('Failed to create reconciliation:', error);
    return apiError('Failed to create reconciliation');
  }
}
