import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// Purge soft-deleted records older than 7 days
// Call via: GET /api/cron/purge?key=<CRON_SECRET>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  // Simple auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && key !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const results = {
      accounts: 0,
      transactions: 0,
      budgets: 0,
      categories: 0,
      categoryGroups: 0,
      tags: 0,
      transactionTags: 0,
      reconciliations: 0,
    };

    // Delete in dependency order

    // 1. TransactionTags on deleted transactions
    const deletedTxIds = await prisma.transaction.findMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
      select: { id: true },
    });
    if (deletedTxIds.length > 0) {
      const txIds = deletedTxIds.map(t => t.id);
      const deletedTags = await prisma.transactionTag.deleteMany({
        where: { transactionId: { in: txIds } },
      });
      results.transactionTags = deletedTags.count;
    }

    // 2. Transactions
    const deletedTransactions = await prisma.transaction.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.transactions = deletedTransactions.count;

    // 3. Budgets (cascade deletes linked transactions)
    const deletedBudgets = await prisma.budget.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.budgets = deletedBudgets.count;

    // 4. Categories
    const deletedCategories = await prisma.category.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.categories = deletedCategories.count;

    // 5. Category Groups
    const deletedGroups = await prisma.categoryGroup.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.categoryGroups = deletedGroups.count;

    // 6. Tags
    const deletedTags = await prisma.tag.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.tags = deletedTags.count;

    // 7. Reconciliations
    const deletedReconciliations = await prisma.reconciliation.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.reconciliations = deletedReconciliations.count;

    // 8. Accounts (after reconciliations)
    const deletedAccounts = await prisma.account.deleteMany({
      where: { deletedAt: { lt: sevenDaysAgo } },
    });
    results.accounts = deletedAccounts.count;

    return NextResponse.json({ success: true, purged: results });
  } catch (error) {
    console.error('Purge failed:', error);
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
}