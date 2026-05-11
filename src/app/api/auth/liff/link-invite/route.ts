/**
 * POST /api/auth/liff/link-invite
 *
 * Link a LINE account to a MyFam user using an invite code.
 * Verifies LINE ID token, validates invite code, creates LineLink.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyLineIdToken } from '@/lib/line-id-token';

// Simple in-memory rate limiter: 5 attempts per lineUserId per 15 min
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(lineUserId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(lineUserId);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(lineUserId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, code } = body;

    if (!idToken || !code) {
      return NextResponse.json({ error: 'Missing idToken or code' }, { status: 400 });
    }

    // Verify LINE ID token
    const payload = await verifyLineIdToken(idToken);
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid LINE ID token' }, { status: 401 });
    }

    const lineUserId = payload.sub;

    // Rate limit check
    if (!checkRateLimit(lineUserId)) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    // Check if this LINE account is already linked
    const existingLink = await prisma.lineLink.findUnique({ where: { lineUserId } });
    if (existingLink) {
      return NextResponse.json({ error: 'LINE account already linked' }, { status: 403 });
    }

    // Look up the invite code
    const invite = await prisma.inviteCode.findUnique({
      where: { code: code.toUpperCase() },
      include: { user: true },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    // Check if code is already used
    if (invite.usedAt) {
      return NextResponse.json({ error: 'Invite code already used' }, { status: 409 });
    }

    // Check if code is expired
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invite code expired' }, { status: 410 });
    }

    // Check if target user is already linked (edge case)
    const targetLink = await prisma.lineLink.findUnique({ where: { userId: invite.userId } });
    if (targetLink) {
      return NextResponse.json({ error: 'Target user already linked to another LINE account' }, { status: 409 });
    }

    // Transaction: create LineLink + mark invite as used + update avatar
    const result = await prisma.$transaction(async (tx) => {
      const linePicture = payload.picture;
      const updateData: { avatar?: string } = {};
      if (linePicture && linePicture !== invite.user.avatar) {
        updateData.avatar = linePicture;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: invite.userId },
          data: updateData,
        });
      }

      await tx.lineLink.create({
        data: {
          lineUserId,
          userId: invite.userId,
          displayName: payload.name || invite.user.name,
        },
      });

      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: invite.userId },
        select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
      });

      return updatedUser;
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
    }

    // Set userId cookie
    const cookieStore = await cookies();
    cookieStore.set('userId', result.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.json({
      success: true,
      user: result,
    });
  } catch (err) {
    console.error('[link-invite] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}