import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing route
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  lineLink: {
    findUnique: vi.fn(),
  },
  inviteCode: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockGetAuthUser = vi.fn();
vi.mock('@/lib/api', () => ({
  getAuthUser: mockGetAuthUser,
}));

const { POST: createInvite, GET: listInvites } = await import('./route');

describe('POST /api/invites — family binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-parent users', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'child', familyId: 'fam-a', name: 'Kid' });

    const req = new Request('http://localhost/api/invites', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    });
    const res = await createInvite(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only parents can create invites' });
  });

  it('rejects invite for user in a different family', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'p1', role: 'parent', familyId: 'fam-a', name: 'Dad' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', familyId: 'fam-b', name: 'Stranger' });

    const req = new Request('http://localhost/api/invites', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    });
    const res = await createInvite(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found or not in same family' });
  });

  it('rejects invite for already-linked user', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'p1', role: 'parent', familyId: 'fam-a', name: 'Dad' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', familyId: 'fam-a', name: 'Kid' });
    mockPrisma.lineLink.findUnique.mockResolvedValue({ id: 'link-1', userId: 'u2' });

    const req = new Request('http://localhost/api/invites', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    });
    const res = await createInvite(req);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'User already linked to LINE' });
  });

  it('creates invite with correct familyId', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'p1', role: 'parent', familyId: 'fam-a', name: 'Dad' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', familyId: 'fam-a', name: 'Kid' });
    mockPrisma.lineLink.findUnique.mockResolvedValue(null);
    mockPrisma.inviteCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.inviteCode.create.mockResolvedValue({
      code: 'A1B2C3D4',
      familyId: 'fam-a',
      userId: 'u2',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const req = new Request('http://localhost/api/invites', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    });
    const res = await createInvite(req);
    const body = await res.json();

    expect(mockPrisma.inviteCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          familyId: 'fam-a',
          userId: 'u2',
          createdById: 'p1',
        }),
      })
    );
    expect(body.success).toBe(true);
    expect(body.invite.userName).toBe('Kid');
  });
});

describe('GET /api/invites — list invites', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists only invites from same family', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'p1', role: 'parent', familyId: 'fam-a', name: 'Dad' });
    mockPrisma.inviteCode.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        code: 'A1B2',
        userId: 'u2',
        familyId: 'fam-a',
        usedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        user: { id: 'u2', name: 'Kid', avatar: null },
      },
    ]);

    const res = await listInvites();
    const body = await res.json();

    expect(mockPrisma.inviteCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'fam-a' },
      })
    );
    expect(body.invites.length).toBe(1);
    expect(body.invites[0].userName).toBe('Kid');
    expect(body.invites[0].status).toBe('active');
  });
});
