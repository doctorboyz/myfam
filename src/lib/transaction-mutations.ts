/**
 * Shared transaction mutations — single source of truth for balance math.
 *
 * Balance formulas (locked by transaction-mutations.test.ts — DO NOT change
 * without updating the regression tests):
 *   income:            balance += amount - fee
 *   expense:           balance -= amount + fee
 *   transfer (source): balance -= amount + fee
 *   transfer (dest):   balance += amount
 *
 * Extracted from /api/transactions POST so the Telegram bot records
 * transactions with exactly the same semantics as the web app.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const transactionInclude = {
  category: { include: { group: true } },
  account: true,
  toAccount: true,
  tagRecords: { include: { tag: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

export interface CreateTransactionInput {
  amount: number;
  date: Date | string;
  type: 'income' | 'expense' | 'transfer';
  description?: string | null;
  status?: 'completed' | 'pending' | 'planned';
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  budgetId?: string | null;
  createdById: string;
  fee?: number;
  planAmount?: number | null;
  slipImage?: string | null;
  imageHash?: string | null;
  /** Tags to connect-or-create (name + owner scope). Bot flows use this. */
  ensureTags?: Array<{ name: string; userId: string; familyId: string }>;
  /** Existing tag ids to attach. */
  tagIds?: string[];
}

/**
 * Create a transaction and adjust account balances in one DB transaction.
 * Planned transactions store amount in planAmount and skip balance changes.
 * Pending transactions (bot "needs confirmation" flow) also skip balances
 * before the user confirms them via the bot session flow.
 */
export async function createTransaction(
  input: CreateTransactionInput,
  tx?: Prisma.TransactionClient,
): Promise<TransactionWithRelations> {
  const run = async (db: Prisma.TransactionClient) => {
    const status = input.status ?? 'completed';
    const isPlanned = status === 'planned';
    const amount = Number(input.amount || 0);
    const fee = Number(input.fee || 0);

    const tagRecords: { create: Array<Record<string, unknown>> } | undefined =
      input.tagIds && input.tagIds.length > 0
        ? { create: input.tagIds.map((tagId: string) => ({ tagId })) }
        : input.ensureTags && input.ensureTags.length > 0
          ? {
              create: input.ensureTags.map((t) => ({
                tag: {
                  connectOrCreate: {
                    where: { name_userId: { name: t.name, userId: t.userId } },
                    create: { name: t.name, userId: t.userId, familyId: t.familyId },
                  },
                },
              })),
            }
          : undefined;

    const transaction = await db.transaction.create({
      data: {
        amount: isPlanned ? 0 : amount,
        planAmount: isPlanned ? amount : (input.planAmount ?? null),
        date: typeof input.date === 'string' ? new Date(input.date) : input.date,
        type: input.type,
        status,
        description: input.description ?? null,
        accountId: input.accountId || null,
        toAccountId: input.toAccountId || null,
        categoryId: input.categoryId || null,
        budgetId: input.budgetId || null,
        createdById: input.createdById,
        fee,
        totalAmount: amount + fee,
        slipImage: input.slipImage || null,
        imageHash: input.imageHash || null,
        tagRecords: tagRecords as never,
      },
      include: transactionInclude,
    });

    // Only adjust balances for completed transactions with an account
    if (status === 'completed' && input.accountId) {
      if (input.type === 'income') {
        await db.account.update({
          where: { id: input.accountId },
          data: { balance: { increment: amount - fee } },
        });
      } else {
        // expense and transfer source both pay amount + fee
        await db.account.update({
          where: { id: input.accountId },
          data: { balance: { decrement: amount + fee } },
        });
      }

      if (input.type === 'transfer' && input.toAccountId) {
        await db.account.update({
          where: { id: input.toAccountId },
          data: { balance: { increment: amount } },
        });
      }
    }

    return transaction;
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Soft-delete a transaction and revert its balance effect.
 * Reversal mirrors the create formulas above exactly.
 */
export async function softDeleteTransaction(
  transactionId: string,
  deletedById: string,
  tx?: Prisma.TransactionClient,
): Promise<TransactionWithRelations | null> {
  const run = async (db: Prisma.TransactionClient) => {
    const transaction = await db.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction || transaction.deletedAt) return null;

    const amount = Number(transaction.amount);
    const fee = Number(transaction.fee || 0);

    if (transaction.status === 'completed' && transaction.accountId) {
      if (transaction.type === 'income') {
        await db.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: amount - fee } },
        });
      } else {
        await db.account.update({
          where: { id: transaction.accountId },
          data: { balance: { increment: amount + fee } },
        });
      }

      if (transaction.type === 'transfer' && transaction.toAccountId) {
        await db.account.update({
          where: { id: transaction.toAccountId },
          data: { balance: { decrement: amount } },
        });
      }
    }

    return db.transaction.update({
      where: { id: transactionId },
      data: { deletedAt: new Date(), deletedById },
      include: transactionInclude,
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Map a transaction to the frontend-friendly shape (tags/tagIds arrays,
 * slipImage stripped from lists — callers that need it fetch by id).
 */
export function mapTransactionForClient(tx: TransactionWithRelations) {
  const { slipImage: _slipImage, ...rest } = tx;
  return {
    ...rest,
    slipImage: null,
    tags: tx.tagRecords.map((tr) => tr.tag.name),
    tagIds: tx.tagRecords.map((tr) => tr.tagId),
  };
}