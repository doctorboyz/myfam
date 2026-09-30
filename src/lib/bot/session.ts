/**
 * DB-backed bot session store — replaces the LINE bot's in-memory Map
 * that died on every deploy. TTL 10 minutes; payload is JSONB.
 *
 * Kinds:
 *   'transaction' — money in/out recording flow (extracted data + step)
 *   'reconcile'   — balance adjustment flow
 *   'failure'     — consecutive failure counter for escalation hints
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const SESSION_TTL_MS = 10 * 60 * 1000;

export type SessionKind = 'transaction' | 'reconcile' | 'failure';

export const TX_STEPS = [
  'awaiting_confirm',
  'awaiting_account',
  'awaiting_direction',
  'awaiting_category',
  // เปลี่ยนแปลง flow — waiting for the typed new value of one field
  'awaiting_edit_description',
  'awaiting_edit_amount',
  'select_source',
  'select_dest',
] as const;
export type TxStep = (typeof TX_STEPS)[number];

export const RECONCILE_STEPS = ['awaiting_reconcile_account', 'awaiting_reconcile_confirm'] as const;
export type ReconcileStep = (typeof RECONCILE_STEPS)[number];

export interface TxSessionPayload {
  extracted?: Record<string, unknown>;
  imageBase64?: string | null;
  imageHash?: string | null;
  sourceAccountId?: string | null;
  singleAccountId?: string | null;
}

export interface ReconcileSessionPayload {
  accountId?: string;
  accountName?: string;
  accountNameRaw?: string | null;
  amount?: number;
  mode?: 'set' | 'adjust';
  adjustSign?: number;
  note?: string | null;
  confidence?: number;
  currentBalance?: number;
  newBalance?: number;
  difference?: number;
}

export async function getSession<T>(
  userId: string,
  kind: SessionKind,
): Promise<{ step: string; payload: T } | null> {
  const session = await prisma.botSession.findUnique({
    where: { userId_kind: { userId, kind } },
  });
  if (!session) return null;

  // Expired — purge and report "no session" (upsert last-writer-wins
  // tolerates Telegram's out-of-order updates, expiry does the cleanup)
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.botSession.deleteMany({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return { step: session.step, payload: session.payload as T };
}

export async function setSession(
  userId: string,
  kind: SessionKind,
  step: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const jsonPayload = payload as Prisma.InputJsonObject;
  await prisma.botSession.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, step, payload: jsonPayload, expiresAt },
    update: { step, payload: jsonPayload, expiresAt },
  });
}

export async function clearSession(userId: string, kind: SessionKind): Promise<void> {
  await prisma.botSession.deleteMany({ where: { userId, kind } }).catch(() => {});
}

/** Purge every expired session — called from /api/cron/purge. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.botSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ── Failure counter ──────────────────────────────────────────────

interface FailurePayload {
  count: number;
  lastFailure: number;
}

/**
 * Record a failure. Returns an escalation hint appended to error
 * messages once the user hits 3 failures within 5 minutes.
 */
export async function incrementFailure(userId: string): Promise<string> {
  const existing = await getSession<FailurePayload>(userId, 'failure');
  const now = Date.now();

  let count = 1;
  if (existing && now - existing.payload.lastFailure < 5 * 60 * 1000) {
    count = existing.payload.count + 1;
  }

  await setSession(userId, 'failure', 'counter', { count, lastFailure: now });

  if (count >= 3) {
    return '\n\n💁 หากยังไม่สำเร็จ ลองบันทึกผ่านเว็บแอป MyFam ได้ที่ https://myfam.doctorboyz.com';
  }
  return '';
}

export async function resetFailures(userId: string): Promise<void> {
  await clearSession(userId, 'failure');
}