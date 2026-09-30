import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { apiSuccess, apiError, getAuthUser, isParentOrAdmin } from '@/lib/api';
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
    };
    if (isParentOrAdmin(currentUser)) {
      // Parents see the whole family's activity.
      where.createdBy = { familyId: currentUser.familyId };
    } else {
      // Children only see transactions on their own accounts (plus
      // anything they recorded themselves, e.g. budget planned items).
      const ownAccounts = await prisma.account.findMany({
        where: { ownerId: currentUser.id, deletedAt: null },
        select: { id: true },
      });
      const ownIds = ownAccounts.map((a) => a.id);
      where.OR = [
        { accountId: { in: ownIds } },
        { toAccountId: { in: ownIds } },
        { createdById: currentUser.id },
      ];
    }
    if (accountId) {
      where.AND = { OR: [{ accountId }, { toAccountId: accountId }] };
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
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const body = await request.json();

    // Who the transaction is recorded for: parents may record on behalf of
    // a family member; children always record as themselves.
    let createdById = currentUser.id;
    if (body.createdById && body.createdById !== currentUser.id) {
      if (!isParentOrAdmin(currentUser)) {
        return apiError('Not authorized to record for another member', 403);
      }
      const onBehalfOf = await prisma.user.findUnique({
        where: { id: body.createdById },
        select: { familyId: true },
      });
      if (!onBehalfOf || onBehalfOf.familyId !== currentUser.familyId) {
        return apiError('Not authorized to record for another member', 403);
      }
      createdById = body.createdById;
    }

    // Accounts must belong to the same family; children may only use their own.
    const accountIds = [body.accountId, body.toAccountId].filter(Boolean) as string[];
    if (accountIds.length > 0) {
      const accounts = await prisma.account.findMany({
        where: { id: { in: accountIds }, deletedAt: null },
        select: { id: true, ownerId: true, owner: { select: { familyId: true } } },
      });
      for (const acc of accounts) {
        if (acc.owner.familyId !== currentUser.familyId) {
          return apiError('Not authorized', 403);
        }
        if (!isParentOrAdmin(currentUser) && acc.ownerId !== currentUser.id) {
          return apiError('Not authorized to use another member account', 403);
        }
      }
    }

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
      createdById,
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