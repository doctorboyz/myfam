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

// ── Prisma mock: u1 = current user, u2 = other member ──────────────
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const { PATCH } = await import('./route');

const PARENT = { id: 'u1', name: 'DoctorBoyz', role: 'parent', isAdmin: false, familyId: 'fam1', password: 'x' };
const CHILD = { id: 'u1', name: 'Lisha', role: 'child', isAdmin: false, familyId: 'fam1', password: 'x' };
const OTHER_CHILD = { id: 'u2', name: 'Lita', role: 'child', isAdmin: false, familyId: 'fam1', password: 'x' };
const OTHER_FAMILY = { id: 'u9', name: 'Stranger', role: 'child', isAdmin: false, familyId: 'fam-other', password: 'x' };

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/users/u2', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
const props = { params: Promise.resolve({ id: 'u2' }) };

describe('PATCH /api/users/[id] — auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.cookieValue = 'u1';
  });

  it('returns 401 when not authenticated', async () => {
    h.cookieValue = undefined;

    const res = await PATCH(makeReq({ name: 'Hacker' }), props);
    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks a child from editing another member (role escalation hole)', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u1') return CHILD;
      if (where.id === 'u2') return OTHER_CHILD;
      return null;
    });

    const res = await PATCH(makeReq({ role: 'parent' }), props);
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('strips role from a child self-edit but allows own password change', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u1') return CHILD;
      if (where.id === 'u2') return CHILD; // self-edit: u2 resolves to same user
      return null;
    });
    mockPrisma.user.update.mockResolvedValue(CHILD);

    // Self-edit: cookie u1, target u1.
    const selfProps = { params: Promise.resolve({ id: 'u1' }) };
    const res = await PATCH(
      new Request('http://localhost/api/users/u1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'NewName', role: 'parent', password: 'newpass' }),
      }),
      selfProps
    );

    expect(res.status).toBe(200);
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.name).toBe('NewName');
    expect(data.role).toBeUndefined();
    expect(typeof data.password).toBe('string');
    expect(data.password).not.toBe('newpass'); // bcrypt-hashed
  });

  it('lets a parent change another member role', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u1') return PARENT;
      if (where.id === 'u2') return OTHER_CHILD;
      return null;
    });
    mockPrisma.user.update.mockResolvedValue(OTHER_CHILD);

    const res = await PATCH(makeReq({ role: 'parent' }), props);
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { role: 'parent' },
    });
  });

  it('blocks a parent from changing their own role', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u1') return PARENT;
      if (where.id === 'u2') return PARENT; // self target
      return null;
    });

    const selfProps = { params: Promise.resolve({ id: 'u1' }) };
    const res = await PATCH(
      new Request('http://localhost/api/users/u1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'child' }),
      }),
      selfProps
    );

    // role is stripped for self-edit; update still proceeds with no fields
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.role).toBeUndefined();
  });

  it('blocks editing a user in a different family', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'u1') return PARENT;
      if (where.id === 'u2') return OTHER_FAMILY;
      return null;
    });

    const res = await PATCH(makeReq({ name: 'X' }), props);
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});