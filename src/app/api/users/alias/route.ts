import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';

// POST /api/users/alias — Set or update an alias for a family member
export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { targetId, alias } = body;

    if (!targetId || typeof alias !== 'string' || alias.trim().length === 0) {
      return NextResponse.json({ error: 'Missing targetId or alias' }, { status: 400 });
    }

    if (targetId === user.id) {
      return NextResponse.json({ error: 'Cannot set alias for yourself' }, { status: 400 });
    }

    const trimmedAlias = alias.trim();
    if (trimmedAlias.length > 50) {
      return NextResponse.json({ error: 'Alias must be 50 characters or less' }, { status: 400 });
    }

    // Verify target user exists and is in the same family
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    if (!targetUser || targetUser.familyId !== user.familyId) {
      return NextResponse.json({ error: 'User not found or not in same family' }, { status: 404 });
    }

    const upserted = await prisma.userAlias.upsert({
      where: { ownerId_targetId: { ownerId: user.id, targetId } },
      create: { ownerId: user.id, targetId, alias: trimmedAlias },
      update: { alias: trimmedAlias },
    });

    return NextResponse.json({ success: true, alias: upserted });
  } catch (err) {
    console.error('[alias] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/users/alias — List aliases set by current user
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const aliases = await prisma.userAlias.findMany({
      where: { ownerId: user.id },
      include: { target: { select: { id: true, name: true, avatar: true, color: true } } },
      orderBy: { alias: 'asc' },
    });

    return NextResponse.json({ success: true, aliases });
  } catch (err) {
    console.error('[alias] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/users/alias?targetId=xxx — Remove an alias
export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('targetId');
    if (!targetId) {
      return NextResponse.json({ error: 'Missing targetId' }, { status: 400 });
    }

    await prisma.userAlias.deleteMany({
      where: { ownerId: user.id, targetId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[alias] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
