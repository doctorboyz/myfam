import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';
import crypto from 'crypto';

// POST /api/invites — Generate an invite code for a family member
export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'parent') return NextResponse.json({ error: 'Only parents can create invites' }, { status: 403 });

    const body = await request.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // Verify target user is in the same family
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser || targetUser.familyId !== user.familyId) {
      return NextResponse.json({ error: 'User not found or not in same family' }, { status: 404 });
    }

    // Check if target user already has a LINE link
    const existingLink = await prisma.lineLink.findUnique({ where: { userId } });
    if (existingLink) {
      return NextResponse.json({ error: 'User already linked to LINE' }, { status: 409 });
    }

    // Delete any existing unused invite for this user
    await prisma.inviteCode.deleteMany({ where: { userId, usedAt: null } });

    // Generate 8-char hex code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        userId,
        familyId: user.familyId,
        createdById: user.id,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      invite: {
        code: invite.code,
        userId: targetUser.id,
        userName: targetUser.name,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[invites] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/invites — List invite codes for the family
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'parent') return NextResponse.json({ error: 'Only parents can view invites' }, { status: 403 });

    const invites = await prisma.inviteCode.findMany({
      where: { familyId: user.familyId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const result = invites.map((inv) => ({
      id: inv.id,
      code: inv.code,
      userId: inv.userId,
      userName: inv.user.name,
      userAvatar: inv.user.avatar,
      usedAt: inv.usedAt?.toISOString() ?? null,
      expiresAt: inv.expiresAt.toISOString(),
      expired: inv.expiresAt < now && !inv.usedAt,
      status: inv.usedAt ? 'used' : inv.expiresAt < now ? 'expired' : 'active',
    }));

    return NextResponse.json({ success: true, invites: result });
  } catch (err) {
    console.error('[invites] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}