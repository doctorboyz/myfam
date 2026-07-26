/**
 * GET  /api/users/identity — get current user's identity
 * POST /api/users/identity — update current user's identity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';

// GET
export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { identity: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let identity = null;
    if (user.identity) {
      try {
        identity = JSON.parse(user.identity);
      } catch {
        identity = null;
      }
    }

    return NextResponse.json({ success: true, identity });
  } catch (error) {
    console.error('GET /api/users/identity error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { identity } = body;

    if (typeof identity !== 'object' || !identity) {
      return NextResponse.json({ error: 'identity must be an object' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { identity: JSON.stringify(identity) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/users/identity error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
