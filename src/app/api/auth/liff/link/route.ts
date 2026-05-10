/**
 * POST /api/auth/liff/link
 *
 * Link a LINE account to an existing MyFam user.
 * Verifies LINE ID token, authenticates with username/password,
 * creates LineLink record, sets userId cookie.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

async function verifyLineIdToken(idToken: string): Promise<{ sub: string; name?: string; picture?: string } | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) return null;

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${encodeURIComponent(idToken)}&client_id=${encodeURIComponent(channelId)}`,
    });

    if (!res.ok) return null;

    const payload = await res.json();
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, username, password } = body;

    if (!idToken || !username) {
      return NextResponse.json({ error: 'Missing idToken or username' }, { status: 400 });
    }

    // Verify LINE ID token
    const payload = await verifyLineIdToken(idToken);
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid LINE ID token' }, { status: 401 });
    }

    const lineUserId = payload.sub;

    // Check if this LINE account is already linked
    const existingLink = await prisma.lineLink.findUnique({
      where: { lineUserId },
    });

    if (existingLink) {
      return NextResponse.json({ error: 'LINE account already linked' }, { status: 409 });
    }

    // Find MyFam user by username
    const user = await prisma.user.findUnique({
      where: { name: username },
      select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ชื่อนี้' }, { status: 404 });
    }

    // Verify password if the user has one
    if (user.password && user.password !== password) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    // Create LineLink
    await prisma.lineLink.create({
      data: {
        lineUserId,
        userId: user.id,
        displayName: payload.name || username,
      },
    });

    // Set userId cookie
    const cookieStore = await cookies();
    cookieStore.set('userId', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    // Return user data (exclude password)
    const { password: _, ...userData } = user;
    return NextResponse.json({
      success: true,
      user: userData,
    });
  } catch (err) {
    console.error('[liff-link] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}