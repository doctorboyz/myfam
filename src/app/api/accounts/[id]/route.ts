import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId, pickFields, getAuthUser, isParentOrAdmin } from '@/lib/api';

/**
 * Load an account and verify the session user may act on it:
 * same family, and either the owner or a parent/admin.
 */
async function getActionableAccount(accountId: string, currentUser: { id: string; familyId: string | null } & { role: string; isAdmin: boolean }) {
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

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { account, error } = await getActionableAccount(id, currentUser);
    if (error) return error;

    const body = await request.json();
    // NOTE: `balance` is deliberately NOT editable here — the reconciliation
    // flow is the only audited path that changes a balance.
    const data = pickFields(body, ['name', 'type', 'color', 'icon', 'accountNo', 'alias', 'status']) as Record<string, unknown>;
    data.updatedById = currentUser.id;

    const updated = await prisma.account.update({
      where: { id },
      data,
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Failed to update account:', error);
    return apiError('Failed to update account');
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

    const { error } = await getActionableAccount(id, currentUser);
    if (error) return error;

    // Soft delete: set deletedAt and deletedById
    await prisma.account.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: currentUser.id,
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return apiError('Failed to delete account');
  }
}