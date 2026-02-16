import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const where: Prisma.TransactionWhereInput = {
      createdBy: { familyId: currentUser.familyId },
    };
    if (accountId) {
      where.OR = [
        { accountId },
        { toAccountId: accountId },
      ];
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        category: { include: { group: true } },
        account: true,
        toAccount: true,
      },
    });
    return apiSuccess(transactions);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return apiError('Failed to fetch transactions');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const isPlanned = body.status === 'planned';

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          amount: isPlanned ? 0 : body.amount,
          planAmount: isPlanned ? body.amount : (body.planAmount || null),
          date: new Date(body.date),
          type: body.type,
          status: isPlanned ? 'planned' : 'completed',
          description: body.description,
          accountId: body.accountId || null,
          toAccountId: body.toAccountId || null,
          categoryId: body.categoryId,
          budgetId: body.budgetId || null,
          createdById: body.createdById,
          tags: body.tags || [],
          fee: body.fee || 0,
          slipImage: body.slipImage || null,
        },
        include: {
          category: { include: { group: true } },
          account: true,
          toAccount: true,
        },
      });

      // Only adjust balances for completed transactions with an account
      if (!isPlanned && body.accountId) {
        const amount = Number(body.amount);
        const fee = body.fee ? Number(body.fee) : 0;

        if (body.type === 'income') {
          await tx.account.update({
            where: { id: body.accountId },
            data: { balance: { increment: amount - fee } },
          });
        } else {
          await tx.account.update({
            where: { id: body.accountId },
            data: { balance: { decrement: amount + fee } },
          });
        }

        if (body.type === 'transfer' && body.toAccountId) {
          await tx.account.update({
            where: { id: body.toAccountId },
            data: { balance: { increment: amount } },
          });
        }
      }

      return transaction;
    });

    return apiSuccess(result, 201);
  } catch (error) {
    console.error('Failed to create transaction:', error);
    return apiError('Failed to create transaction');
  }
}
