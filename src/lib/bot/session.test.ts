import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Session store tests — TTL expiry, upsert semantics, failure counter.
 * The store is DB-backed so sessions survive restarts mid-flow.
 */

const sessions = new Map<string, { id: string; userId: string; kind: string; step: string; payload: unknown; expiresAt: Date }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    botSession: {
      findUnique: vi.fn(async (args: any) => {
        const where = args.where;
        const key = `${where.userId_kind.userId}|${where.userId_kind.kind}`;
        return sessions.get(key) ?? null;
      }),
      upsert: vi.fn(async (args: any) => {
        const where = args.where; const create = args.create;
        const key = `${create.userId}|${create.kind}`;
        const existing = sessions.get(key);
        const row = { id: existing?.id ?? 'sess-1', ...create };
        sessions.set(key, row);
        return row;
      }),
      deleteMany: vi.fn(async (args: any) => {
        const where = args.where;
        if (where.id) {
          for (const [k, v] of sessions) if (v.id === where.id) sessions.delete(k);
          return { count: 1 };
        }
        if (where.userId && where.kind) {
          const key = `${where.userId}|${where.kind}`;
          return { count: sessions.delete(key) ? 1 : 0 };
        }
        if (where.userId_kind) {
          const key = `${where.userId_kind.userId}|${where.userId_kind.kind}`;
          return { count: sessions.delete(key) ? 1 : 0 };
        }
        if (where.expiresAt) {
          let count = 0;
          for (const [k, v] of sessions) {
            if (v.expiresAt < where.expiresAt.lt) { sessions.delete(k); count++; }
          }
          return { count };
        }
        return { count: 0 };
      }),
    },
  },
}));

const { getSession, setSession, clearSession, purgeExpiredSessions, incrementFailure, resetFailures, SESSION_TTL_MS } =
  await import('./session');

const USER = 'user-1';

beforeEach(() => {
  sessions.clear();
  vi.clearAllMocks();
});

describe('session store', () => {
  it('setSession then getSession round-trips step and payload', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', { extracted: { amount: 85 } });
    const s = await getSession(USER, 'transaction');
    expect(s?.step).toBe('awaiting_confirm');
    expect((s?.payload as { extracted: { amount: number } }).extracted.amount).toBe(85);
  });

  it('upsert overwrites the previous step for the same kind', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', { a: 1 });
    await setSession(USER, 'transaction', 'select_source', { b: 2 });
    const s = await getSession(USER, 'transaction');
    expect(s?.step).toBe('select_source');
    expect(s?.payload).toEqual({ b: 2 });
  });

  it('expired session reads as null and is purged', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', {});
    const key = `${USER}|transaction`;
    const row = sessions.get(key)!;
    row.expiresAt = new Date(Date.now() - 1000); // backdate

    expect(await getSession(USER, 'transaction')).toBeNull();
    expect(sessions.has(key)).toBe(false);
  });

  it('kinds are isolated — reconcile does not clobber transaction', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', { a: 1 });
    await setSession(USER, 'reconcile', 'awaiting_reconcile_confirm', { b: 2 });
    expect((await getSession(USER, 'transaction'))?.step).toBe('awaiting_confirm');
    expect((await getSession(USER, 'reconcile'))?.step).toBe('awaiting_reconcile_confirm');
  });

  it('clearSession removes only that kind', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', {});
    await setSession(USER, 'reconcile', 'awaiting_reconcile_confirm', {});
    await clearSession(USER, 'transaction');
    expect(await getSession(USER, 'transaction')).toBeNull();
    expect(await getSession(USER, 'reconcile')).not.toBeNull();
  });

  it('purgeExpiredSessions deletes only expired rows', async () => {
    await setSession(USER, 'transaction', 'awaiting_confirm', {});
    await setSession('user-2', 'transaction', 'awaiting_confirm', {});
    sessions.get(`${USER}|transaction`)!.expiresAt = new Date(Date.now() - 1);

    const count = await purgeExpiredSessions();
    expect(count).toBe(1);
    expect(await getSession(USER, 'transaction')).toBeNull();
    expect(await getSession('user-2', 'transaction')).not.toBeNull();
  });

  it('TTL is 10 minutes', () => {
    expect(SESSION_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe('failure counter', () => {
  it('escalates after 3 failures within 5 minutes', async () => {
    expect(await incrementFailure(USER)).toBe('');
    expect(await incrementFailure(USER)).toBe('');
    const third = await incrementFailure(USER);
    expect(third).toContain('myfam.doctorboyz.com');
  });

  it('counter resets after 5 minutes of quiet', async () => {
    // Backdate the last failure beyond the 5-minute window, keep the row alive
    sessions.set(`${USER}|failure`, {
      id: 'f', userId: USER, kind: 'failure', step: 'counter',
      payload: { count: 2, lastFailure: Date.now() - 6 * 60 * 1000 },
      expiresAt: new Date(Date.now() + 60000),
    });
    const hint = await incrementFailure(USER);
    expect(hint).toBe(''); // window expired → count restarts at 1
  });

  it('resetFailures clears the counter', async () => {
    await incrementFailure(USER);
    await incrementFailure(USER);
    await resetFailures(USER);
    expect(await incrementFailure(USER)).toBe('');
  });
});