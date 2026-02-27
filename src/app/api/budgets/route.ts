import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const budgets = await prisma.budget.findMany({
      where: {
        status: { not: 'archived' },
        createdBy: { familyId: currentUser.familyId },
      },
      include: {
        transactions: true,
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
        tags: tx.tags ?? [],
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
    const { title, period, limit, startDate, endDate, createdById } = await request.json();

    if (!createdById) {
      return apiError('createdById is required', 400);
    }

    const newBudget = await prisma.budget.create({
      data: {
        title,
        period,
        limit,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        createdById,
        status: 'active',
      },
    });

    return apiSuccess(newBudget);
  } catch (error) {
    console.error('Failed to create budget:', error);
    return apiError('Failed to create budget');
  }
}
