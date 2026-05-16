import { describe, it, expect, vi } from 'vitest';

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
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/api', () => ({
  apiSuccess: vi.fn((data: any, status?: number) => new Response(JSON.stringify(data), { status: status || 200 })),
  apiError: vi.fn((message: string, status?: number) => new Response(JSON.stringify({ error: message }), { status: status || 500 })),
}));

const { POST } = await import('./route');

describe('POST /api/accounts — initial balance via reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        ownerId: 'u1',
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

});
