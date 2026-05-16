import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const where: Prisma.AccountWhereInput = {
      deletedAt: null,
      owner: { familyId: currentUser.familyId },
    };
    if (userId) {
      where.ownerId = userId;
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { owner: true },
    });
    return apiSuccess(accounts);
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    return apiError('Failed to fetch accounts');
  }
}

export async function POST(request: Request) {
  try {
    const { name, type, balance, color, ownerId, icon, alias, accountNo } = await request.json();
    const initialBalance = Number(balance) || 0;

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name,
          type: type || 'wallet',
          balance: 0,
          color: color || '#000000',
          icon,
          alias,
          accountNo,
          ownerId,
        },
      });

      if (initialBalance > 0) {
        await tx.reconciliation.create({
          data: {
            accountId: account.id,
            previousBalance: 0,
            newBalance: initialBalance,
            difference: initialBalance,
            note: 'ยอดเริ่มต้น',
            performedById: ownerId,
          },
        });

        await tx.account.update({
          where: { id: account.id },
          data: { balance: initialBalance },
        });
      }

      return account;
    });

    return apiSuccess(result, 201);
  } catch (error) {
    console.error('Failed to create account:', error);
    return apiError('Failed to create account');
  }
}
