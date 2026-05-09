/**
 * POST /api/line/link
 *
 * Link a LINE userId to a MyFam userId.
 * 1:1 mapping — each LINE account maps to exactly one MyFam user.
 *
 * Request body:
 *   { lineUserId: string, userId: string, displayName?: string }
 *
 * GET /api/line/link?userId=xxx
 *   Check if a MyFam user has a LINE link.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';

/**
 * GET /api/line/link?userId=xxx
 * Check if a MyFam user has a LINE link.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return apiError('Missing userId parameter', 400);
    }

    const link = await prisma.lineLink.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!link) {
      return apiSuccess({ linked: false });
    }

    return apiSuccess({
      linked: true,
      lineUserId: link.lineUserId,
      displayName: link.displayName,
      user: link.user,
    });
  } catch (error) {
    console.error('Link check error:', error);
    return apiError('Failed to check link status');
  }
}

/**
 * POST /api/line/link
 * Create or update a LINE-MyFam link.
 * 1:1 mapping enforced by unique constraints on both lineUserId and userId.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.lineUserId || !body.userId) {
      return apiError('Missing required fields: lineUserId, userId', 400);
    }

    // Verify the user exists
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, role: true, familyId: true },
    });

    if (!user) {
      return apiError('User not found', 404);
    }

    // Check if LINE userId is already linked to a different MyFam user
    const existingByLine = await prisma.lineLink.findUnique({
      where: { lineUserId: body.lineUserId },
    });

    if (existingByLine && existingByLine.userId !== body.userId) {
      return apiError(
        'This LINE account is already linked to a different MyFam user',
        409,
      );
    }

    // Check if MyFam userId is already linked to a different LINE account
    const existingByUser = await prisma.lineLink.findUnique({
      where: { userId: body.userId },
    });

    if (existingByUser && existingByUser.lineUserId !== body.lineUserId) {
      return apiError(
        'This MyFam user is already linked to a different LINE account',
        409,
      );
    }

    // Create or update the link (upsert)
    const link = await prisma.lineLink.upsert({
      where: { lineUserId: body.lineUserId },
      update: {
        userId: body.userId,
        displayName: body.displayName || null,
      },
      create: {
        lineUserId: body.lineUserId,
        userId: body.userId,
        displayName: body.displayName || null,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    return apiSuccess({
      success: true,
      link: {
        id: link.id,
        lineUserId: link.lineUserId,
        userId: link.userId,
        displayName: link.displayName,
        user: link.user,
      },
    }, 201);
  } catch (error) {
    console.error('Link creation error:', error);
    return apiError('Failed to create link');
  }
}

/**
 * DELETE /api/line/link?lineUserId=xxx
 * Unlink a LINE account from MyFam.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lineUserId = searchParams.get('lineUserId');

    if (!lineUserId) {
      return apiError('Missing lineUserId parameter', 400);
    }

    const link = await prisma.lineLink.findUnique({
      where: { lineUserId },
    });

    if (!link) {
      return apiError('Link not found', 404);
    }

    await prisma.lineLink.delete({ where: { lineUserId } });

    return apiSuccess({ success: true, deleted: link.id });
  } catch (error) {
    console.error('Link deletion error:', error);
    return apiError('Failed to delete link');
  }
}