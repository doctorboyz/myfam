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

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  account: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockMutations = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  mapTransactionForClient: vi.fn((tx) => tx),
  transactionInclude: {},
}));

vi.mock('@/lib/transaction-mutations', () => mockMutations);

const { POST } = await import('./route');

const CHILD = { id: 'u1', name: 'Lisha', role: 'child', isAdmin: false, familyId: 'fam1' };
const PARENT = { id: 'u1', name: 'Tukky', role: 'parent', isAdmin: false, familyId: 'fam1' };

const OWN_ACCOUNT = { id: 'acc-own', ownerId: 'u1', owner: { familyId: 'fam1' } };
const SIBLING_ACCOUNT = { id: 'acc-sib', ownerId: 'u2', owner: { familyId: 'fam1' } };
const FOREIGN_ACCOUNT = { id: 'acc-x', ownerId: 'u9', owner: { familyId: 'fam-other' } };

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const TX_BODY = {
  amount: 100,
  date: '2026-09-30',
  type: 'expense',
  description: 'ขนม',
  accountId: 'acc-own',
};

describe('POST /api/transactions — auth + scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.cookieValue = 'u1';
    mockMutations.createTransaction.mockResolvedValue({ id: 'tx-1' });
  });

  it('returns 401 when not authenticated', async () => {
    h.cookieValue = undefined;

    const res = await POST(makeReq(TX_BODY));
    expect(res.status).toBe(401);
    expect(mockMutations.createTransaction).not.toHaveBeenCalled();
  });

  it('blocks a child from using a sibling account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);
    mockPrisma.account.findMany.mockResolvedValue([SIBLING_ACCOUNT]);

    const res = await POST(makeReq({ ...TX_BODY, accountId: 'acc-sib' }));
    expect(res.status).toBe(403);
    expect(mockMutations.createTransaction).not.toHaveBeenCalled();
  });

  it('blocks a child from recording on behalf of another member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);

    const res = await POST(makeReq({ ...TX_BODY, createdById: 'u2' }));
    expect(res.status).toBe(403);
    expect(mockMutations.createTransaction).not.toHaveBeenCalled();
  });

  it('forces createdById to the session user for a child', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(CHILD);
    mockPrisma.account.findMany.mockResolvedValue([OWN_ACCOUNT]);

    const res = await POST(makeReq(TX_BODY));
    expect(res.status).toBe(201);

    const data = mockMutations.createTransaction.mock.calls[0][0];
    expect(data.createdById).toBe('u1'); // session user, never from body
  });

  it('blocks an account from a different family', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(PARENT);
    mockPrisma.account.findMany.mockResolvedValue([FOREIGN_ACCOUNT]);

    const res = await POST(makeReq({ ...TX_BODY, accountId: 'acc-x' }));
    expect(res.status).toBe(403);
    expect(mockMutations.createTransaction).not.toHaveBeenCalled();
  });

  it('lets a parent record on behalf of a family member', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u2') return { familyId: 'fam1' };
      return PARENT;
    });
    mockPrisma.account.findMany.mockResolvedValue([SIBLING_ACCOUNT]);

    const res = await POST(makeReq({ ...TX_BODY, accountId: 'acc-sib', createdById: 'u2' }));
    expect(res.status).toBe(201);

    const data = mockMutations.createTransaction.mock.calls[0][0];
    expect(data.createdById).toBe('u2');
  });
});