import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

const transactionInclude = {
  category: { include: { group: true } },
  account: true,
  toAccount: true,
  tagRecords: { include: { tag: true } },
};

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const transactions = await prisma.transaction.findMany({
      where: {
        deletedAt: { not: null },
        createdBy: { familyId: currentUser.familyId },
      },
      orderBy: { deletedAt: 'desc' },
      include: transactionInclude,
    });

    const mapped = transactions.map(tx => ({
      ...tx,
      tags: tx.tagRecords.map((tr: { tag: { name: string } }) => tr.tag.name),
      tagIds: tx.tagRecords.map((tr: { tagId: string }) => tr.tagId),
    }));

    return apiSuccess(mapped);
  } catch (error) {
    console.error('Failed to fetch trashed transactions:', error);
    return apiError('Failed to fetch trashed transactions');
  }
}