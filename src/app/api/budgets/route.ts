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
    return apiSuccess(budgets);
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
