/**
 * Data helpers + transaction recording for the bot.
 * Writes directly via Prisma (never calls the app's own HTTP routes)
 * and uses the shared balance formulas in transaction-mutations.ts.
 */

import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { createTransaction, type TransactionWithRelations } from '@/lib/transaction-mutations';
import type { CategoryContextItem, ExtractedTransaction } from './extract';

export const BOT_TAG = 'telegram-bot';

export interface BotUser {
  id: string;
  name: string;
  role: string;
  familyId: string;
}

/** Parent sees family-wide data; children see their own (same as web app). */
export function getDataScope(user: Pick<BotUser, 'id' | 'role' | 'familyId'>) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

export async function findDefaultAccount(userId: string) {
  return prisma.account.findFirst({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getUserAccounts(userId: string) {
  return prisma.account.findMany({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getCategoriesForFamily(familyId: string) {
  const users = await prisma.user.findMany({
    where: { familyId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  return prisma.category.findMany({
    where: {
      deletedAt: null,
      OR: [{ userId: null }, { userId: { in: userIds } }],
    },
    include: { group: true },
  });
}

export function getCategoryContext(
  categories: Awaited<ReturnType<typeof getCategoriesForFamily>>,
): CategoryContextItem[] {
  return categories
    .filter((c) => c.group.deletedAt === null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
      groupType: c.group.type,
    }));
}

/** sha256 of image bytes — duplicate-slip detection. */
export function hashImageBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface CreateBotTxOptions {
  accountId?: string | null;
  toAccountId?: string | null;
  status?: 'completed' | 'pending';
  imageBase64?: string | null;
  imageHash?: string | null;
}

/**
 * Create a transaction tagged 'telegram-bot'.
 * Balance math lives in transaction-mutations.ts — single source of truth.
 */
export async function createBotTransaction(
  extracted: ExtractedTransaction,
  user: BotUser,
  options: CreateBotTxOptions = {},
): Promise<TransactionWithRelations> {
  return createTransaction({
    amount: extracted.amount,
    date: extracted.date,
    type: extracted.type,
    status: options.status ?? 'completed',
    description: extracted.description,
    accountId: options.accountId ?? null,
    toAccountId: options.toAccountId ?? null,
    categoryId: extracted.categoryId,
    createdById: user.id,
    fee: extracted.fee || 0,
    slipImage: options.imageBase64 ? `data:image/jpeg;base64,${options.imageBase64}` : null,
    imageHash: options.imageHash ?? null,
    ensureTags: [{ name: BOT_TAG, userId: user.id, familyId: user.familyId }],
  });
}

/** Find transactions similar to an extraction (duplicate warning before save). */
export async function findSimilarTransactions(
  extracted: ExtractedTransaction,
  scope: ReturnType<typeof getDataScope>,
) {
  const extractedDate = new Date(extracted.date);
  const amountTolerance = 1;

  return prisma.transaction.findMany({
    where: {
      ...scope,
      deletedAt: null,
      type: extracted.type,
      amount: {
        gte: extracted.amount - amountTolerance,
        lte: extracted.amount + amountTolerance,
      },
      date: {
        gte: new Date(extractedDate.getFullYear(), extractedDate.getMonth(), extractedDate.getDate()),
        lt: new Date(extractedDate.getFullYear(), extractedDate.getMonth(), extractedDate.getDate() + 1),
      },
      description: extracted.description,
      status: { not: 'void' },
    },
    take: 3,
  });
}