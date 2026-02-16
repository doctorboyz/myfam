import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return apiError('Username and password are required', 400);
    }

    const user = await prisma.user.findFirst({
      where: { name: username },
    });

    if (!user || !user.password) {
      return apiError('Invalid username or password', 401);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return apiError('Invalid username or password', 401);
    }

    const cookieStore = await cookies();
    cookieStore.set('userId', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return apiSuccess({
      id: user.id,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
      avatar: user.avatar,
      color: user.color,
      familyId: user.familyId,
    });
  } catch (error) {
    console.error('Login error:', error);
    return apiError('Login failed');
  }
}
