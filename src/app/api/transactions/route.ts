import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';
import {
  createTransaction,
  mapTransactionForClient,
  transactionInclude,
} from '@/lib/transaction-mutations';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const where: Prisma.TransactionWhereInput = {
      deletedAt: null,
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
      include: transactionInclude,
    });

    // Map to include tag names for frontend compatibility.
    // NOTE: slipImage (base64, up to several MB each) is intentionally excluded
    // from the list payload — it is fetched on demand from /api/transactions/[id]
    // when a transaction detail is opened. Including it here made every page load
    // pull ~7MB and stalled the app on slower connections.
    const mapped = transactions.map(({ slipImage: _slipImage, ...tx }) => ({
      ...tx,
      slipImage: null,
      tags: tx.tagRecords.map((tr: { tag: { name: string } }) => tr.tag.name),
      tagIds: tx.tagRecords.map((tr: { tagId: string }) => tr.tagId),
    }));

    return apiSuccess(mapped);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return apiError('Failed to fetch transactions');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = await createTransaction({
      amount: body.amount,
      date: body.date,
      type: body.type,
      status: body.status === 'planned' ? 'planned' : 'completed',
      description: body.description,
      accountId: body.accountId || null,
      toAccountId: body.toAccountId || null,
      categoryId: body.categoryId,
      budgetId: body.budgetId || null,
      createdById: body.createdById,
      fee: body.fee || 0,
      planAmount: body.planAmount || null,
      slipImage: body.slipImage || null,
      tagIds: body.tagIds || [],
    });

    // Map tag records for frontend
    const mapped = mapTransactionForClient(result);

    return apiSuccess(mapped, 201);
  } catch (error) {
    console.error('Failed to create transaction:', error);
    return apiError('Failed to create transaction');
  }
}