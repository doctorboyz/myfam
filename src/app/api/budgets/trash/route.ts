import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const budgets = await prisma.budget.findMany({
      where: {
        deletedAt: { not: null },
        createdBy: { familyId: currentUser.familyId },
      },
      orderBy: { deletedAt: 'desc' },
      include: {
        transactions: { include: { tagRecords: { include: { tag: true } } } },
      },
    });

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
    console.error('Failed to fetch trashed budgets:', error);
    return apiError('Failed to fetch trashed budgets');
  }
}