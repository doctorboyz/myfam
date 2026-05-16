import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing route
const mockCookieStore = {
  set: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

const mockPrisma = {
  lineLink: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  inviteCode: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockVerifyLineIdToken = vi.fn();
vi.mock('@/lib/line-id-token', () => ({
  verifyLineIdToken: mockVerifyLineIdToken,
}));

// Import route AFTER mocks
const { POST } = await import('./route');

describe('POST /api/auth/liff/link-invite', () => {
  let lineUserCounter = 0;
  const nextPayload = () => ({
    sub: `line-user-${++lineUserCounter}`,
    name: 'LineTester',
    picture: 'https://line.me/pic.jpg',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockInvite = {
    id: 'inv-1',
    code: 'ABC12345',
    userId: 'fam-user-1',
    familyId: 'fam-a',
    usedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
    user: {
      id: 'fam-user-1',
      name: 'Kid',
      avatar: null,
      role: 'child',
      familyId: 'fam-a',
      color: null,
      isAdmin: false,
    },
  };

  const mockLinkedUser = {
    id: 'fam-user-1',
    name: 'Kid',
    role: 'child',
    isAdmin: false,
    avatar: 'https://line.me/pic.jpg',
    color: null,
    familyId: 'fam-a',
  };

  it('rejects when idToken is missing', async () => {
    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing idToken or code' });
  });

  it('rejects when code is missing', async () => {
    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects invalid LINE idToken', async () => {
    mockVerifyLineIdToken.mockResolvedValue(null);

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'bad', code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid LINE ID token' });
  });

  it('rejects when LINE account already linked', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique.mockResolvedValue({ id: 'link-1', lineUserId: payload.sub });

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'LINE account already linked' });
  });

  it('rejects when invite code not found', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique.mockResolvedValue(null);
    mockPrisma.inviteCode.findUnique.mockResolvedValue(null);

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'NOTFOUND' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Invite code not found' });
  });

  it('rejects when invite code already used', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique.mockResolvedValue(null);
    mockPrisma.inviteCode.findUnique.mockResolvedValue({
      ...mockInvite,
      usedAt: new Date(),
    });

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Invite code already used' });
  });

  it('rejects when invite code expired', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique.mockResolvedValue(null);
    mockPrisma.inviteCode.findUnique.mockResolvedValue({
      ...mockInvite,
      expiresAt: new Date(Date.now() - 1000),
    });

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'Invite code expired' });
  });

  it('rejects when target user already linked to another LINE account', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'link-2', userId: 'fam-user-1' });

    mockPrisma.inviteCode.findUnique.mockResolvedValue(mockInvite);

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'ABC12345' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Target user already linked to another LINE account' });
  });

  it('successfully links LINE account to family user within same family', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockPrisma.inviteCode.findUnique.mockResolvedValue(mockInvite);
    mockPrisma.user.findUnique.mockResolvedValue(mockLinkedUser);
    mockPrisma.lineLink.create.mockResolvedValue({ id: 'new-link-1' });
    mockPrisma.inviteCode.update.mockResolvedValue({ ...mockInvite, usedAt: new Date() });
    mockPrisma.user.update.mockResolvedValue(mockLinkedUser);

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'ABC12345' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user).toEqual(mockLinkedUser);

    expect(mockPrisma.lineLink.create).toHaveBeenCalledWith({
      data: {
        lineUserId: payload.sub,
        userId: 'fam-user-1',
        displayName: 'LineTester',
      },
    });

    expect(mockPrisma.inviteCode.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { usedAt: expect.any(Date) },
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'fam-user-1' },
      data: { avatar: 'https://line.me/pic.jpg' },
    });

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'userId',
      'fam-user-1',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
      })
    );
  });

  it('converts invite code to uppercase before lookup', async () => {
    const payload = nextPayload();
    mockVerifyLineIdToken.mockResolvedValue(payload);
    mockPrisma.lineLink.findUnique.mockResolvedValue(null);
    mockPrisma.inviteCode.findUnique.mockResolvedValue({
      ...mockInvite,
      usedAt: new Date(),
    });

    const req = new Request('http://localhost/api/auth/liff/link-invite', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok', code: 'abc12345' }),
    });
    await POST(req);

    expect(mockPrisma.inviteCode.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'ABC12345' },
      })
    );
  });
});
