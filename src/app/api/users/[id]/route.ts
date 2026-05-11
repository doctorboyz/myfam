import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields, getAuthUser } from '@/lib/api';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const body = await request.json();
    const data = pickFields(body, ['name', 'role', 'color', 'avatar']);

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    return apiSuccess(updatedUser);
  } catch (error) {
    console.error('Failed to update user:', error);
    return apiError('Failed to update user');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const currentUser = await getAuthUser();

    // Only parent or admin can delete users
    if (!currentUser) return apiError('Not authenticated', 401);
    if (currentUser.role !== 'parent' && !currentUser.isAdmin) {
      return apiError('Not authorized', 403);
    }

    // Don't allow deleting yourself
    if (currentUser.id === id) {
      return apiError('Cannot delete your own account', 400);
    }

    // Verify target user exists and is in the same family
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return apiError('User not found', 404);
    if (targetUser.familyId !== currentUser.familyId) {
      return apiError('Not authorized', 403);
    }

    // Cascade delete in correct order to respect FK constraints:
    // 1. TransactionTags (via Transaction)
    // 2. Reconciliations
    // 3. Transactions (includes budget items)
    // 4. Budgets
    // 5. Tags
    // 6. Categories (user-created)
    // 7. Accounts
    // 8. LineLink
    // 9. User
    await prisma.$transaction(async (tx) => {
      // Get all transaction IDs for this user
      const transactionIds = await tx.transaction.findMany({
        where: { createdById: id },
        select: { id: true },
      });
      const txIds = transactionIds.map(t => t.id);

      // Delete TransactionTags for this user's transactions
      if (txIds.length > 0) {
        await tx.transactionTag.deleteMany({
          where: { transactionId: { in: txIds } },
        });
      }

      // Delete Reconciliations for this user's accounts
      const accountIds = await tx.account.findMany({
        where: { ownerId: id },
        select: { id: true },
      });
      const acctIds = accountIds.map(a => a.id);

      if (acctIds.length > 0) {
        await tx.reconciliation.deleteMany({
          where: { accountId: { in: acctIds } },
        });
      }

      // Delete Transactions created by this user
      await tx.transaction.deleteMany({
        where: { createdById: id },
      });

      // Delete Budgets created by this user
      await tx.budget.deleteMany({
        where: { createdById: id },
      });

      // Delete Tags owned by this user
      await tx.tag.deleteMany({
        where: { userId: id },
      });

      // Delete Categories created by this user
      await tx.category.deleteMany({
        where: { userId: id },
      });

      // Delete Accounts owned by this user (cascade deletes reconciliations)
      await tx.account.deleteMany({
        where: { ownerId: id },
      });

      // Delete LineLink for this user
      await tx.lineLink.deleteMany({
        where: { userId: id },
      });

      // Finally, delete the user
      await tx.user.delete({
        where: { id },
      });
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return apiError('Failed to delete user');
  }
}