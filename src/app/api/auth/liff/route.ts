/**
 * POST /api/auth/liff
 *
 * Verify LINE ID token, look up LineLink, set userId cookie.
 * If user is not linked, return needsLinking flag with LINE profile.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyLineIdToken } from '@/lib/line-id-token';
import { seedDefaultCategories } from '@/lib/default-categories';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify ID token with LINE Platform
    const payload = await verifyLineIdToken(idToken);
    if (!payload || !payload.sub) {
      return NextResponse.json({ error: 'Invalid LINE ID token' }, { status: 401 });
    }

    const lineUserId = payload.sub;

    // Look up existing link
    const link = await prisma.lineLink.findUnique({
      where: { lineUserId },
      include: {
        user: {
          select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
        },
      },
    });

    if (link) {
      // Update user name and avatar from LINE profile if missing or outdated
      const lineName = payload.name;
      const linePicture = payload.picture;
      const updateData: { name?: string; avatar?: string } = {};

      if (lineName && lineName !== link.user.name) {
        updateData.name = lineName;
      }
      if (linePicture && linePicture !== link.user.avatar) {
        updateData.avatar = linePicture;
      }

      if (Object.keys(updateData).length > 0) {
        const updatedUser = await prisma.user.update({
          where: { id: link.userId },
          data: updateData,
          select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
        });
        link.user = updatedUser;
      }

      // User is linked — set cookie and return user data
      const cookieStore = await cookies();
      cookieStore.set('userId', link.userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return NextResponse.json({
        success: true,
        linked: true,
        user: link.user,
        lineProfile: {
          lineUserId,
          displayName: payload.name || link.displayName,
          pictureUrl: payload.picture || null,
        },
      });
    }

    // No link found — auto-create new user + family (signup with LINE)
    const baseName = payload.name || 'User';
    let userName = baseName;
    let suffix = 1;
    while (await prisma.user.findUnique({ where: { name: userName } })) {
      userName = `${baseName}_${suffix}`;
      suffix++;
    }

    const family = await prisma.family.create({
      data: { name: `${userName}'s Family` },
    });

    // Seed default system categories for new families
    await seedDefaultCategories();

    const newUser = await prisma.user.create({
      data: {
        name: userName,
        role: 'parent',
        isAdmin: true,
        familyId: family.id,
        avatar: payload.picture || null,
      },
      select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
    });

    await prisma.lineLink.create({
      data: {
        lineUserId,
        userId: newUser.id,
        displayName: payload.name || userName,
      },
    });

    const cookieStore = await cookies();
    cookieStore.set('userId', newUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({
      success: true,
      linked: true,
      user: newUser,
      lineProfile: {
        lineUserId,
        displayName: payload.name || userName,
        pictureUrl: payload.picture || null,
      },
    });
  } catch (err) {
    console.error('[liff-auth] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}