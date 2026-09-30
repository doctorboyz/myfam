import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  cookieValue: 'u1' as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'userId' && h.cookieValue ? { value: h.cookieValue } : undefined,
  })),
}));

// Client handed to prisma.$transaction(fn) — balance adjustments run here.
const txClient = vi.hoisted(() => ({
  account: { update: vi.fn() },
  transaction: { update: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  account: { findMany: vi.fn() },
  transaction: { findFirst: vi.fn(), update: vi.fn() },
  transactionTag: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockMutations = vi.hoisted(() => ({
  softDeleteTransaction: vi.fn(),
  transactionInclude: {},
}));

vi.mock('@/lib/transaction-mutations', () => mockMutations);

const { PATCH, DELETE } = await import('./route');

const CHILD = { id: 'u1', name: 'Lisha', role: 'child', isAdmin: false, familyId: 'fam1' };
const PARENT = { id: 'u-p', name: 'Tukky', role: 'parent', isAdmin: false, familyId: 'fam1' };

// A completed expense recorded by another child on their own account.
const EXISTING = {
  id: 'tx-1',
  createdById: 'u2',
  status: 'completed',
  type: 'expense',
  amount: 100,
  fee: 0,
  totalAmount: 100,
  accountId: 'acc-a',
  toAccountId: null,
  description: 'ขนม',
  deletedAt: null,
  tagRecords: [],
};

const OWN_ACCOUNT = { id: 'acc-a', ownerId: 'u1', owner: { familyId: 'fam1' } };
const SIBLING_ACCOUNT = { id: 'acc-sib', ownerId: 'u2', owner: { familyId: 'fam1' } };

function makeReq(method: string, body?: Record<string, unknown>) {
  return new Request('http://localhost/api/transactions/tx-1', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const PROPS = { params: Promise.resolve({ id: 'tx-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.cookieValue = 'u1';
  mockPrisma.transaction.findFirst.mockResolvedValue({ ...EXISTING });
  mockPrisma.transaction.update.mockResolvedValue({ ...EXISTING, tagRecords: [] });
  txClient.transaction.update.mockResolvedValue({ ...EXISTING, tagRecords: [] });
  txClient.account.update.mockResolvedValue({});
  mockMutations.softDeleteTransaction.mockResolvedValue({ ...EXISTING });
});

describe('PATCH /api/transactions/[id] — balance-affecting edits', () => {
  // Root cause of "edits silently revert": the PATCH allowlist never
  // accepted amount/fee/type/accountId, so these fields were dropped.
  it('persists amount edits and rebalances the account (revert + apply)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...CHILD, id: 'u1' });
    mockPrisma.transaction.findFirst.mockResolvedValue({ ...EXISTING, createdById: 'u1' });

    const res = await PATCH(makeReq('PATCH', { amount: 250 }), PROPS);
    expect(res.status).toBe(200);

    const updateCall = txClient.transaction.update.mock.calls[0][0];
    expect(updateCall.data.amount).toBe(250);
    expect(updateCall.data.totalAmount).toBe(250);

    // Old effect reverted (expense: +100), new effect applied (-250)
    const balances = txClient.account.update.mock.calls.map((c: unknown[]) => (c[0] as { data: { balance: unknown } }).data.balance);
    expect(balances).toEqual([{ increment: 100 }, { decrement: 250 }]);
  });

  it('recomputes totalAmount when the fee changes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...CHILD, id: 'u1' });
    mockPrisma.transaction.findFirst.mockResolvedValue({ ...EXISTING, createdById: 'u1' });

    const res = await PATCH(makeReq('PATCH', { amount: 200, fee: 10 }), PROPS);
    expect(res.status).toBe(200);

    const updateCall = txClient.transaction.update.mock.calls[0][0];
    expect(updateCall.data.totalAmount).toBe(210);
  });

  it('moves the balance when the account changes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(PARENT);
    mockPrisma.account.findMany.mockResolvedValue([SIBLING_ACCOUNT]);

    const res = await PATCH(makeReq('PATCH', { accountId: 'acc-sib' }), PROPS);
    expect(res.status).toBe(200);

    const updates = txClient.account.update.mock.calls.map((c: unknown[]) => ({
      id: (c[0] as { where: { id: string } }).where.id,
      balance: (c[0] as { data: { balance: unknown } }).data.balance,
    }));
    // Revert on the old account, apply on the new one
    expect(updates).toEqual([
      { id: 'acc-a', balance: { increment: 100 } },
      { id: 'acc-sib', balance: { decrement: 100 } },
    ]);
  });
});

describe('PATCH /api/transactions/[id] — authorization', () => {
  it('blocks a child from editing another member transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);

    const res = await PATCH(makeReq('PATCH', { description: 'แก้' }), PROPS);
    expect(res.status).toBe(403);
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    expect(txClient.transaction.update).not.toHaveBeenCalled();
  });

  it('lets a parent edit a transaction recorded by a child', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(PARENT);

    const res = await PATCH(makeReq('PATCH', { description: 'แก้' }), PROPS);
    expect(res.status).toBe(200);
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tx-1' }, data: expect.objectContaining({ description: 'แก้' }) })
    );
  });

  it('blocks a child from moving a transaction to a sibling account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);
    mockPrisma.transaction.findFirst.mockResolvedValue({ ...EXISTING, createdById: 'u1' });
    mockPrisma.account.findMany.mockResolvedValue([SIBLING_ACCOUNT]);

    const res = await PATCH(makeReq('PATCH', { accountId: 'acc-sib' }), PROPS);
    expect(res.status).toBe(403);
    expect(txClient.transaction.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/transactions/[id] — planned rows keep amount=0', () => {
  it('routes amount edits on planned transactions to planAmount', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...CHILD, id: 'u1' });
    mockPrisma.transaction.findFirst.mockResolvedValue({
      ...EXISTING, createdById: 'u1', status: 'planned', amount: 0, planAmount: 100,
    });

    const res = await PATCH(makeReq('PATCH', { amount: 300 }), PROPS);
    expect(res.status).toBe(200);

    const updateCall = mockPrisma.transaction.update.mock.calls[0][0];
    expect(updateCall.data.planAmount).toBe(300);
    expect(updateCall.data.amount).toBeUndefined();
    // No balance effect for planned rows
    expect(txClient.account.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/transactions/[id] — authorization', () => {
  it('blocks a child from deleting another member transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);

    const res = await DELETE(makeReq('DELETE'), PROPS);
    expect(res.status).toBe(403);
    expect(mockMutations.softDeleteTransaction).not.toHaveBeenCalled();
  });

  it('lets a parent delete a child transaction through the shared soft-delete', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(PARENT);

    const res = await DELETE(makeReq('DELETE'), PROPS);
    expect(res.status).toBe(200);
    expect(mockMutations.softDeleteTransaction).toHaveBeenCalledWith('tx-1', 'u-p');
  });
});