import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Balance formula regression lock — DO NOT let these drift.
 * These formulas are the source of truth shared by the web app
 * (/api/transactions POST) and the Telegram bot:
 *   income:            balance += amount - fee
 *   expense:           balance -= amount + fee
 *   transfer (source): balance -= amount + fee
 *   transfer (dest):   balance += amount
 *   planned:           no balance change
 */

const mockTx = {
  transaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  account: { update: vi.fn() },
};

const mockPrisma = {
  $transaction: vi.fn(async (cb: any) => cb(mockTx)),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const { createTransaction, softDeleteTransaction } = await import(
  '@/lib/transaction-mutations'
);

const baseInput = {
  amount: 100,
  date: '2026-09-29T10:00:00.000Z',
  type: 'expense' as const,
  createdById: 'user-1',
  accountId: 'acc-1',
};

describe('createTransaction — balance formulas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.transaction.create.mockResolvedValue({
      id: 'tx-1',
      tagRecords: [],
      amount: 100,
      fee: 0,
      type: 'expense',
      status: 'completed',
    });
  });

  it('income: balance += amount - fee', async () => {
    await createTransaction({ ...baseInput, type: 'income', amount: 1000, fee: 20 });

    expect(mockTx.account.update).toHaveBeenCalledTimes(1);
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 980 } },
    });
  });

  it('income without fee: balance += amount', async () => {
    await createTransaction({ ...baseInput, type: 'income', amount: 500 });

    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 500 } },
    });
  });

  it('expense: balance -= amount + fee', async () => {
    await createTransaction({ ...baseInput, type: 'expense', amount: 300, fee: 15 });

    expect(mockTx.account.update).toHaveBeenCalledTimes(1);
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { decrement: 315 } },
    });
  });

  it('transfer: source -= amount + fee, dest += amount (fee stays on source)', async () => {
    await createTransaction({
      ...baseInput,
      type: 'transfer',
      amount: 2000,
      fee: 10,
      toAccountId: 'acc-2',
    });

    expect(mockTx.account.update).toHaveBeenCalledTimes(2);
    expect(mockTx.account.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'acc-1' },
      data: { balance: { decrement: 2010 } },
    });
    expect(mockTx.account.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'acc-2' },
      data: { balance: { increment: 2000 } },
    });
  });

  it('planned: amount stored as planAmount, no balance change', async () => {
    await createTransaction({ ...baseInput, status: 'planned', amount: 5000 });

    expect(mockTx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 0,
        planAmount: 5000,
        status: 'planned',
      }),
      include: expect.anything(),
    });
    expect(mockTx.account.update).not.toHaveBeenCalled();
  });

  it('pending: no balance change until confirmed', async () => {
    await createTransaction({ ...baseInput, status: 'pending', amount: 450 });

    expect(mockTx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'pending' }),
      include: expect.anything(),
    });
    expect(mockTx.account.update).not.toHaveBeenCalled();
  });

  it('totalAmount = amount + fee', async () => {
    await createTransaction({ ...baseInput, amount: 250, fee: 7 });

    expect(mockTx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmount: 257 }),
      include: expect.anything(),
    });
  });
});

describe('softDeleteTransaction — reversal formulas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.transaction.update.mockResolvedValue({ id: 'tx-1', tagRecords: [] });
  });

  it('income delete: balance -= amount - fee', async () => {
    mockTx.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', amount: 1000, fee: 20, type: 'income', status: 'completed',
      accountId: 'acc-1', toAccountId: null, deletedAt: null,
    });

    await softDeleteTransaction('tx-1', 'user-1');

    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { decrement: 980 } },
    });
    expect(mockTx.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date), deletedById: 'user-1' }),
      include: expect.anything(),
    });
  });

  it('expense delete: balance += amount + fee', async () => {
    mockTx.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', amount: 300, fee: 15, type: 'expense', status: 'completed',
      accountId: 'acc-1', toAccountId: null, deletedAt: null,
    });

    await softDeleteTransaction('tx-1', 'user-1');

    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 315 } },
    });
  });

  it('transfer delete: source += amount + fee, dest -= amount', async () => {
    mockTx.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', amount: 2000, fee: 10, type: 'transfer', status: 'completed',
      accountId: 'acc-1', toAccountId: 'acc-2', deletedAt: null,
    });

    await softDeleteTransaction('tx-1', 'user-1');

    expect(mockTx.account.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'acc-1' },
      data: { balance: { increment: 2010 } },
    });
    expect(mockTx.account.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'acc-2' },
      data: { balance: { decrement: 2000 } },
    });
  });

  it('already-deleted transaction: no-op', async () => {
    mockTx.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', deletedAt: new Date(), type: 'expense', status: 'completed',
      accountId: 'acc-1', toAccountId: null, amount: 100, fee: 0,
    });

    const result = await softDeleteTransaction('tx-1', 'user-1');

    expect(result).toBeNull();
    expect(mockTx.account.update).not.toHaveBeenCalled();
    expect(mockTx.transaction.update).not.toHaveBeenCalled();
  });
});
