import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, parseId } from '@/lib/api';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const id = await parseId(props);

    // Permanent delete — only for items already soft-deleted
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return apiError('Account not found', 404);
    if (!account.deletedAt) {
      return apiError('Account must be soft-deleted before permanent deletion', 400);
    }

    await prisma.account.delete({ where: { id } });
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Failed to permanently delete account:', error);
    return apiError('Failed to permanently delete account');
  }
}