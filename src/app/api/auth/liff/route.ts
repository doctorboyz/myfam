/**
 * POST /api/auth/liff
 *
 * Verify LINE ID token, look up LineLink, set userId cookie.
 * If user is not linked, return needsLinking flag with LINE profile.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

interface LineIdTokenPayload {
  sub: string; // LINE userId
  name?: string;
  picture?: string;
  aud: string;
  exp: number;
  iss: string;
}

async function verifyLineIdToken(idToken: string): Promise<LineIdTokenPayload | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    console.error('[liff-auth] LINE_CHANNEL_ID not configured');
    return null;
  }

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${encodeURIComponent(idToken)}&client_id=${encodeURIComponent(channelId)}`,
    });

    if (!res.ok) {
      console.error('[liff-auth] LINE verify failed:', res.status);
      return null;
    }

    const payload: LineIdTokenPayload = await res.json();

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.error('[liff-auth] ID token expired');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[liff-auth] LINE verify error:', err);
    return null;
  }
}

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

    // No link found — return needsLinking flag
    return NextResponse.json({
      success: false,
      needsLinking: true,
      lineProfile: {
        lineUserId,
        displayName: payload.name || null,
        pictureUrl: payload.picture || null,
      },
    });
  } catch (err) {
    console.error('[liff-auth] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}