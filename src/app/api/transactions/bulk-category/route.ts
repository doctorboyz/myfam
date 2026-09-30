import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser, isParentOrAdmin } from '@/lib/api';

/**
 * Bulk-assign a category to many transactions at once — the cleanup tool
 * for rows that were recorded without a category (หมวดหมู่ is the report
 * validation). Category changes don't touch balances, so this is a flat
 * updateMany, not a per-row balance transaction.
 */
export async function POST(request: Request) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const body = await request.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';
    if (ids.length === 0 || !categoryId) {
      return apiError('ids and categoryId are required', 400);
    }

    // The category must be visible to this family (global or family custom).
    const members = await prisma.user.findMany({
      where: { familyId: currentUser.familyId },
      select: { id: true },
    });
    const memberIds = members.map((m) => m.id);
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
        OR: [{ userId: null }, { userId: { in: memberIds } }],
      },
    });
    if (!category) return apiError('Category not found', 404);

    // Family-scoped rows; children may only recategorize rows they recorded.
    const rows = await prisma.transaction.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, createdById: true, createdBy: { select: { familyId: true } } },
    });
    const allowedIds = rows
      .filter((r) => r.createdBy.familyId === currentUser.familyId)
      .filter((r) => isParentOrAdmin(currentUser) || r.createdById === currentUser.id)
      .map((r) => r.id);

    if (allowedIds.length === 0) {
      return apiError('No transactions to update', 403);
    }

    const result = await prisma.transaction.updateMany({
      where: { id: { in: allowedIds } },
      data: { categoryId },
    });

    return apiSuccess({ updated: result.count, skipped: ids.length - allowedIds.length });
  } catch (error) {
    console.error('Failed to bulk update categories:', error);
    return apiError('Failed to bulk update categories');
  }
}