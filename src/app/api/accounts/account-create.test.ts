import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mutable auth state (hoisted for the next/headers mock) ──
const h = vi.hoisted(() => ({
  cookieValue: 'u1' as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'userId' && h.cookieValue ? { value: h.cookieValue } : undefined,
  })),
}));

// Mock prisma BEFORE importing route
const mockTx = {
  account: {
    create: vi.fn(),
    update: vi.fn(),
  },
  reconciliation: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  $transaction: vi.fn(async (cb: any) => cb(mockTx)),
  account: {
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/api', () => ({
  apiSuccess: vi.fn((data: any, status?: number) => new Response(JSON.stringify(data), { status: status || 200 })),
  apiError: vi.fn((message: any, status?: number) => new Response(JSON.stringify({ error: message }), { status: status || 500 })),
  getAuthUser: vi.fn(),
  isParentOrAdmin: vi.fn((u: any) => !!u && (u.role === 'parent' || u.isAdmin)),
}));

const { POST, GET } = await import('./route');
const { getAuthUser } = await import('@/lib/api');

const PARENT = { id: 'u1', name: 'Tukky', role: 'parent', isAdmin: false, familyId: 'fam1' };
const CHILD = { id: 'u1', name: 'Lisha', role: 'child', isAdmin: false, familyId: 'fam1' };

describe('POST /api/accounts — initial balance via reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUser).mockResolvedValue(PARENT as any);
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'u2') return { familyId: 'fam1' };
      if (where.id === 'u9') return { familyId: 'fam-other' };
      return null;
    });
  });

  it('creates account with zero balance when no initial balance given', async () => {
    mockTx.account.create.mockResolvedValue({ id: 'acc-1', name: 'Wallet', balance: 0, ownerId: 'u1' });

    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Wallet', type: 'cash', ownerId: 'u1' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(mockTx.account.create).toHaveBeenCalledTimes(1);
    expect(mockTx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Wallet', type: 'cash', balance: 0, ownerId: 'u1' }),
    });
    expect(mockTx.reconciliation.create).not.toHaveBeenCalled();
    expect(mockTx.account.update).not.toHaveBeenCalled();
    expect(body.balance).toBe(0);
  });

  it('creates reconciliation record when initial balance > 0', async () => {
    mockTx.account.create.mockResolvedValue({ id: 'acc-1', name: 'Bank', balance: 0, ownerId: 'u1' });
    mockTx.reconciliation.create.mockResolvedValue({ id: 'rec-1' });
    mockTx.account.update.mockResolvedValue({ id: 'acc-1', balance: 5000 });

    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bank',
        type: 'bank',
        balance: 5000,
        ownerId: 'u1',
        color: '#007AFF',
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(mockTx.account.create).toHaveBeenCalledTimes(1);
    expect(mockTx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Bank',
        type: 'bank',
        balance: 0,
        color: '#007AFF',
      }),
    });

    expect(mockTx.reconciliation.create).toHaveBeenCalledTimes(1);
    expect(mockTx.reconciliation.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acc-1',
        previousBalance: 0,
        newBalance: 5000,
        difference: 5000,
        note: 'ยอดเริ่มต้น',
        performedById: 'u1',
      },
    });

    expect(mockTx.account.update).toHaveBeenCalledTimes(1);
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: 5000 },
    });

    expect(body.id).toBe('acc-1');
  });

  it('rejects an unauthenticated request', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null as any);

    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Wallet', ownerId: 'u1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockTx.account.create).not.toHaveBeenCalled();
  });

  it('blocks a child from creating an account for a sibling', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(CHILD as any);
    mockTx.account.create.mockResolvedValue({ id: 'acc-2', name: 'Child Wallet', ownerId: 'u1' });

    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Child Wallet', ownerId: 'u2' }), // tries to create for sibling
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockTx.account.create).not.toHaveBeenCalled();
  });

  it('lets a parent create an account for a family member', async () => {
    mockTx.account.create.mockResolvedValue({ id: 'acc-3', name: 'Kid Wallet', ownerId: 'u2' });

    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Kid Wallet', ownerId: 'u2' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockTx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Kid Wallet', ownerId: 'u2' }),
    });
  });

  it('blocks a parent from creating an account for someone outside the family', async () => {
    const req = new Request('http://localhost/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Foreign', ownerId: 'u9' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockTx.account.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/accounts — child scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.account.findMany.mockResolvedValue([]);
  });

  it('scopes a child to their own accounts only', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(CHILD as any);

    const req = new Request('http://localhost/api/accounts?userId=u2');
    await GET(req);

    const where = mockPrisma.account.findMany.mock.calls[0][0].where;
    expect(where.ownerId).toBe('u1'); // forced to session user, not u2
  });

  it('gives a parent the requested member scope', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(PARENT as any);

    const req = new Request('http://localhost/api/accounts?userId=u2');
    await GET(req);

    const where = mockPrisma.account.findMany.mock.calls[0][0].where;
    expect(where.ownerId).toBe('u2');
    expect(where.owner).toEqual({ familyId: 'fam1' });
  });
});