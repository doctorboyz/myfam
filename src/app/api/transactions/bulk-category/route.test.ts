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
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  category: { findFirst: vi.fn() },
  transaction: { findMany: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const { POST } = await import('./route');

const CHILD = { id: 'u1', name: 'Lisha', role: 'child', isAdmin: false, familyId: 'fam1' };
const PARENT = { id: 'u-p', name: 'Tukky', role: 'parent', isAdmin: false, familyId: 'fam1' };

const CATEGORY = { id: 'cat-food', name: 'กินข้าว', userId: null };

function makeRow(id: string, createdById: string, familyId = 'fam1') {
  return { id, createdById, createdBy: { familyId } };
}

function makeRequest(ids: string[], categoryId: string) {
  return new Request('http://localhost/api/transactions/bulk-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, categoryId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === 'u1' ? CHILD : where.id === 'u-p' ? PARENT : null,
  );
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u-p' }, { id: 'u2' }]);
  mockPrisma.category.findFirst.mockResolvedValue(CATEGORY);
  mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });
});

describe('POST /api/transactions/bulk-category', () => {
  it('updates family rows for a parent, counting skipped foreign/missing ids', async () => {
    h.cookieValue = 'u-p';
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeRow('tx-1', 'u1'),
      makeRow('tx-2', 'u2'),
      makeRow('tx-x', 'u1', 'fam-other'), // outside the family — filtered
    ]);
    mockPrisma.transaction.updateMany.mockResolvedValue({ count: 2 });

    const res = await POST(makeRequest(['tx-1', 'tx-2', 'tx-x', 'tx-gone'], 'cat-food'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(2);
    expect(body.skipped).toBe(2);
    expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-1', 'tx-2'] } },
      data: { categoryId: 'cat-food' },
    });
  });

  it('lets a child recategorize only rows they recorded themselves', async () => {
    h.cookieValue = 'u1';
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeRow('tx-own', 'u1'),
      makeRow('tx-sibling', 'u2'), // sibling's row — child may not touch it
    ]);

    const res = await POST(makeRequest(['tx-own', 'tx-sibling'], 'cat-food'));

    expect(res.status).toBe(200);
    expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-own'] } },
      data: { categoryId: 'cat-food' },
    });
  });

  it('rejects a category the family cannot see', async () => {
    h.cookieValue = 'u1';
    mockPrisma.category.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest(['tx-1'], 'cat-unknown'));

    expect(res.status).toBe(404);
    expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an empty selection', async () => {
    h.cookieValue = 'u1';

    const res = await POST(makeRequest([], 'cat-food'));

    expect(res.status).toBe(400);
    expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    h.cookieValue = undefined;

    const res = await POST(makeRequest(['tx-1'], 'cat-food'));

    expect(res.status).toBe(401);
  });
});