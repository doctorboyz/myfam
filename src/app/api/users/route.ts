import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';
import { resolveDisplayNames } from '@/lib/display-name';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const users = await prisma.user.findMany({
      where: { familyId: currentUser.familyId },
      include: { lineLink: { select: { lineUserId: true, displayName: true } } },
    });

    const displayMap = await resolveDisplayNames(currentUser.id, users);
    const usersWithDisplay = users.map((u) => ({
      ...u,
      displayName: displayMap.get(u.id) ?? u.name,
    }));

    return apiSuccess(usersWithDisplay);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return apiError('Failed to fetch users');
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { name, role, color, avatar } = await request.json();

    const newUser = await prisma.user.create({
      data: {
        name,
        role: role || 'child',
        color: color || '#000000',
        avatar,
        familyId: currentUser.familyId,
      },
    });

    return apiSuccess(newUser, 201);
  } catch (error) {
    console.error('Failed to create user:', error);
    return apiError('Failed to create user');
  }
}
