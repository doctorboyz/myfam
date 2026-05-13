import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get('purpose');

    const where: any = {
      deletedAt: null,
      createdBy: { familyId: currentUser.familyId },
    };
    if (purpose) {
      where.purpose = purpose;
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        transactions: { include: { tagRecords: { include: { tag: true } } } },
      },
    });

    // Map Prisma transactions → frontend BudgetTransaction items
    const STATUS_MAP: Record<string, string> = {
      planned: 'pending',
      completed: 'done',
      void: 'cancelled',
    };

    const mapped = budgets.map((b) => ({
      ...b,
      items: b.transactions.map((tx) => ({
        id: tx.id,
        name: tx.description || '',
        plannedAmount: Number(tx.planAmount ?? tx.amount),
        actualAmount: tx.status === 'completed' ? Number(tx.amount) : undefined,
        date: tx.date,
        status: STATUS_MAP[tx.status] ?? 'pending',
        type: tx.type,
        categoryId: tx.categoryId ?? '',
        accountId: tx.accountId ?? undefined,
        toAccountId: tx.toAccountId ?? undefined,
        tags: tx.tagRecords?.map((tr: { tag: { name: string } }) => tr.tag.name) ?? [],
        tagIds: tx.tagRecords?.map((tr: { tagId: string }) => tr.tagId) ?? [],
        createdById: tx.createdById,
      })),
    }));

    return apiSuccess(mapped);
  } catch (error) {
    console.error('Failed to fetch budgets:', error);
    return apiError('Failed to fetch budgets');
  }
}


export async function POST(request: Request) {
  try {
    const { title, purpose, period, limit, startDate, endDate, createdById, targetAccountId, rewardForUserId } = await request.json();

    if (!createdById) {
      return apiError('createdById is required', 400);
    }

    const newBudget = await prisma.budget.create({
      data: {
        title,
        purpose: purpose ?? 'spending',
        period,
        limit,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        createdById,
        targetAccountId: targetAccountId ?? undefined,
        rewardForUserId: rewardForUserId ?? undefined,
        status: 'active',
      },
    });

    return apiSuccess(newBudget);
  } catch (error) {
    console.error('Failed to create budget:', error);
    return apiError('Failed to create budget');
  }
}
