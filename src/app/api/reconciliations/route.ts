import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser, isParentOrAdmin } from '@/lib/api';

/**
 * Load an account and verify the session user may reconcile it:
 * same family, and either the owner or a parent/admin.
 */
async function getReconcilableAccount(accountId: string, currentUser: { id: string; familyId: string | null } & { role: string; isAdmin: boolean }) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { owner: { select: { familyId: true } } },
  });
  if (!account) return { error: apiError('Account not found', 404) };
  if (account.owner.familyId !== currentUser.familyId) {
    return { error: apiError('Not authorized', 403) };
  }
  if (account.ownerId !== currentUser.id && !isParentOrAdmin(currentUser)) {
    return { error: apiError('Not authorized', 403) };
  }
  return { account };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return apiError('accountId is required', 400);
  }

  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { error } = await getReconcilableAccount(accountId, currentUser);
    if (error) return error;

    const reconciliations = await prisma.reconciliation.findMany({
      where: { deletedAt: null, accountId },
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
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { accountId, newBalance, note } = await request.json();

    if (!accountId || newBalance === undefined) {
      return apiError('accountId and newBalance are required', 400);
    }

    const { error } = await getReconcilableAccount(accountId, currentUser);
    if (error) return error;

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
          performedById: currentUser.id,
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