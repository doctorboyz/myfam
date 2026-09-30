import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, getAuthUser, isParentOrAdmin } from '@/lib/api';
import { softDeleteTransaction, transactionInclude } from '@/lib/transaction-mutations';

function mapTagRecords(tx: { tagRecords: { tag: { name: string }; tagId: string }[] }) {
  return {
    ...tx,
    tags: tx.tagRecords.map(tr => tr.tag.name),
    tagIds: tx.tagRecords.map(tr => tr.tagId),
  };
}

/**
 * Validate that the accounts referenced in a patch belong to the editor's
 * family (and, for children, to the child themselves) — same rules as POST.
 */
async function validateAccounts(
  accountIds: string[],
  currentUser: { id: string; familyId: string; role: string; isAdmin: boolean }
): Promise<string | null> {
  if (accountIds.length === 0) return null;
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, deletedAt: null },
    select: { id: true, ownerId: true, owner: { select: { familyId: true } } },
  });
  for (const acc of accounts) {
    if (acc.owner.familyId !== currentUser.familyId) {
      return 'Not authorized';
    }
    if (!isParentOrAdmin(currentUser) && acc.ownerId !== currentUser.id) {
      return 'Not authorized to use another member account';
    }
  }
  return null;
}

// Fetch a single transaction (including slipImage) for the detail view.
// The list endpoint omits slipImage to keep its payload small; the detail
// modal calls this to lazy-load the slip image on demand.
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        deletedAt: null,
        createdBy: { familyId: currentUser.familyId },
      },
      include: transactionInclude,
    });

    if (!transaction) return apiError('Transaction not found', 404);

    return apiSuccess(mapTagRecords(transaction));
  } catch (error) {
    console.error('Failed to fetch transaction:', error);
    return apiError('Failed to fetch transaction');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    // Pre-check family scope and ownership before touching balances.
    // Parents manage the whole family's ledger; members delete their own.
    const existing = await prisma.transaction.findFirst({
      where: { id, deletedAt: null, createdBy: { familyId: currentUser.familyId } },
    });
    if (!existing) return apiError('Transaction not found', 404);
    if (existing.createdById !== currentUser.id && !isParentOrAdmin(currentUser)) {
      return apiError('Not authorized to delete this transaction', 403);
    }

    const deleted = await softDeleteTransaction(id, currentUser.id);
    if (!deleted) return apiError('Transaction not found', 404);

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    return apiError('Failed to delete transaction');
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const body = await request.json();

    // Fetch existing transaction to detect status transitions
    const existing = await prisma.transaction.findFirst({
      where: { id, deletedAt: null, createdBy: { familyId: currentUser.familyId } },
    });
    if (!existing) return apiError('Transaction not found', 404);
    // Parents manage the whole family's ledger; members edit their own.
    if (existing.createdById !== currentUser.id && !isParentOrAdmin(currentUser)) {
      return apiError('Not authorized to edit this transaction', 403);
    }

    // Accounts must stay within the family (children: their own) — same as POST.
    const patchAccountIds = [body.accountId, body.toAccountId].filter(Boolean) as string[];
    const accountError = await validateAccounts(patchAccountIds, currentUser);
    if (accountError) return apiError(accountError, 403);

    const isCompletingPlanned =
      existing.status === 'planned' && body.status === 'completed';

    if (isCompletingPlanned) {
      // Planned → Completed: set actual amount, account, and adjust balances
      const result = await prisma.$transaction(async (tx) => {
        const actualAmount = body.amount != null ? Number(body.amount) : Number(existing.planAmount || 0);
        const fee = body.fee != null ? Number(body.fee) : (existing.fee ? Number(existing.fee) : 0);
        const totalAmount = actualAmount + fee;
        const accountId = body.accountId || existing.accountId;
        const toAccountId = body.toAccountId || existing.toAccountId;

        const updated = await tx.transaction.update({
          where: { id },
          data: {
            status: 'completed',
            amount: actualAmount,
            totalAmount,
            accountId,
            toAccountId: toAccountId || null,
            description: body.description ?? existing.description,
            date: body.date ? new Date(body.date) : existing.date,
          },
          include: transactionInclude,
        });

        // Adjust account balances
        if (accountId) {
          if (existing.type === 'income') {
            await tx.account.update({
              where: { id: accountId },
              data: { balance: { increment: actualAmount - fee } },
            });
          } else {
            await tx.account.update({
              where: { id: accountId },
              data: { balance: { decrement: actualAmount + fee } },
            });
          }

          if (existing.type === 'transfer' && toAccountId) {
            await tx.account.update({
              where: { id: toAccountId },
              data: { balance: { increment: actualAmount } },
            });
          }
        }

        return updated;
      });

      return apiSuccess(mapTagRecords(result));
    }

    // Standard update (non-status-transition)
    const updateData: Record<string, unknown> = {};
    const allowedFields = ['description', 'slipImage', 'status', 'categoryId', 'date', 'planAmount'];
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    // Handle date conversion
    if (updateData.date) {
      updateData.date = new Date(updateData.date as string);
    }

    // Balance-affecting fields: amount/fee/type/accounts. For completed
    // transactions we revert the old effect and apply the new one inside
    // one DB transaction, using the same formulas as create/delete
    // (see src/lib/transaction-mutations.ts).
    const oldAmount = Number(existing.amount);
    const oldFee = Number(existing.fee || 0);
    const nextAmount = body.amount != null ? Number(body.amount) : oldAmount;
    const nextFee = body.fee != null ? Number(body.fee) : oldFee;
    const nextType = body.type ?? existing.type;
    const nextAccountId = body.accountId !== undefined ? (body.accountId || null) : existing.accountId;
    const nextToAccountId = body.toAccountId !== undefined ? (body.toAccountId || null) : existing.toAccountId;

    if (body.amount !== undefined || body.fee !== undefined) {
      if (existing.status === 'planned') {
        // Planned rows keep amount=0 until completion; edits go to planAmount.
        if (body.amount !== undefined) updateData.planAmount = nextAmount;
        if (body.fee !== undefined) updateData.fee = nextFee;
      } else {
        updateData.amount = nextAmount;
        updateData.fee = nextFee;
        updateData.totalAmount = nextAmount + nextFee;
      }
    }
    if (body.type !== undefined) updateData.type = nextType;
    if (body.accountId !== undefined) updateData.accountId = nextAccountId;
    if (body.toAccountId !== undefined) updateData.toAccountId = nextToAccountId;

    // Handle tagIds: replace tag records
    if (body.tagIds !== undefined) {
      // Delete existing tag records and create new ones
      await prisma.transactionTag.deleteMany({ where: { transactionId: id } });
      if (Array.isArray(body.tagIds) && body.tagIds.length > 0) {
        updateData.tagRecords = {
          create: (body.tagIds as string[]).map(tagId => ({ tagId })),
        };
      }
    }

    const balanceChanged =
      existing.status === 'completed' &&
      (body.amount !== undefined || body.fee !== undefined || body.type !== undefined ||
        body.accountId !== undefined || body.toAccountId !== undefined);

    let transaction;
    if (balanceChanged && existing.accountId) {
      transaction = await prisma.$transaction(async (tx) => {
        // Revert the old effect
        if (existing.type === 'income') {
          await tx.account.update({
            where: { id: existing.accountId! },
            data: { balance: { decrement: oldAmount - oldFee } },
          });
        } else {
          await tx.account.update({
            where: { id: existing.accountId! },
            data: { balance: { increment: oldAmount + oldFee } },
          });
        }
        if (existing.type === 'transfer' && existing.toAccountId) {
          await tx.account.update({
            where: { id: existing.toAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }

        // Apply the new effect
        if (nextAccountId) {
          if (nextType === 'income') {
            await tx.account.update({
              where: { id: nextAccountId },
              data: { balance: { increment: nextAmount - nextFee } },
            });
          } else {
            await tx.account.update({
              where: { id: nextAccountId },
              data: { balance: { decrement: nextAmount + nextFee } },
            });
          }
          if (nextType === 'transfer' && nextToAccountId) {
            await tx.account.update({
              where: { id: nextToAccountId },
              data: { balance: { increment: nextAmount } },
            });
          }
        }

        return tx.transaction.update({
          where: { id },
          data: updateData,
          include: transactionInclude,
        });
      });
    } else {
      transaction = await prisma.transaction.update({
        where: { id },
        data: updateData,
        include: transactionInclude,
      });
    }

    return apiSuccess(mapTagRecords(transaction));
  } catch (error) {
    console.error('Failed to update transaction:', error);
    return apiError('Failed to update transaction');
  }
}