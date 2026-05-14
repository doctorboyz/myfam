import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';

// GET /api/invites/[code] — Verify and get invite info (Public)
export async function GET(
  request: Request,
  props: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await props.params;

    const invite = await prisma.inviteCode.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        user: {
          select: { name: true }
        }
      }
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invite code expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      userName: invite.user.name,
      code: invite.code
    });
  } catch (err) {
    console.error('[invites] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/invites/[code] — Revoke an invite code
export async function DELETE(
  request: Request,
  props: { params: Promise<{ code: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'parent') return NextResponse.json({ error: 'Only parents can revoke invites' }, { status: 403 });

    const { code } = await props.params;

    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    // Verify the invite belongs to the same family
    if (invite.familyId !== user.familyId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.inviteCode.delete({ where: { id: invite.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[invites] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
