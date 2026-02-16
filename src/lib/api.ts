import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('userId')?.value ?? null;
}

export async function getAuthUser() {
  const userId = await getAuthUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
  });
}

export async function parseId(props: { params: Promise<{ id: string }> }): Promise<string> {
  const params = await props.params;
  return params.id;
}

/**
 * Pick only allowed fields from a request body.
 * Strips undefined values.
 */
export function pickFields<T extends Record<string, unknown>>(
  body: T,
  allowedKeys: string[]
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in body && body[key] !== undefined) {
      result[key] = body[key];
    }
  }
  return result as Partial<T>;
}
