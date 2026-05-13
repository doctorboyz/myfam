import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUserId } from '@/lib/api';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const userId = await getAuthUserId();

    const existing = await prisma.reconciliation.findUnique({ where: { id } });
    if (!existing) return apiError('Reconciliation not found', 404);

    const data: any = {};
    if (body.note !== undefined) data.note = body.note;

    if (Object.keys(data).length > 0 && userId) {
      data.updatedById = userId;
    }

    const updated = await prisma.reconciliation.update({ where: { id }, data });
    return apiSuccess(updated);
  } catch (error) {
    console.error('Failed to update reconciliation:', error);
    return apiError('Failed to update reconciliation');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthUserId();

    const existing = await prisma.reconciliation.findUnique({ where: { id } });
    if (!existing) return apiError('Reconciliation not found', 404);

    // Soft delete
    await prisma.reconciliation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to delete reconciliation:', error);
    return apiError('Failed to delete reconciliation');
  }
}
