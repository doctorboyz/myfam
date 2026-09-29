/**
 * POST /api/telegram/link-code — mint a Telegram binding code for a family member.
 *
 * Parent/admin only. Codes are 6 chars, expire in 7 days, one live code per
 * MyFam user (upsert by the userId unique constraint). Minting again rotates
 * any existing unused code, so stale codes can't linger.
 */

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — read aloud safely

function mintCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export async function POST(request: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (authUser.role !== 'parent' && !authUser.isAdmin) {
    return NextResponse.json({ error: 'forbidden — เฉพาะผู้ปกครอง' }, { status: 403 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!target || target.familyId !== authUser.familyId) {
    return NextResponse.json({ error: 'user not found in your family' }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const code = mintCode();

  // Upsert by userId (unique) — rotating any previous unused code
  const invite = await prisma.inviteCode.upsert({
    where: { userId: target.id },
    create: {
      code,
      userId: target.id,
      familyId: target.familyId,
      createdById: authUser.id,
      expiresAt,
    },
    update: { code, expiresAt, usedAt: null, createdById: authUser.id },
  });

  return NextResponse.json({
    ok: true,
    code: invite.code,
    expiresAt: invite.expiresAt,
    displayName: target.displayName ?? target.name,
  });
}