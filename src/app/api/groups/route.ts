import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser, isParentOrAdmin } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);
    // Category groups shape the whole family's config — parents only.
    if (!isParentOrAdmin(currentUser)) {
      return apiError('Not authorized', 403);
    }

    const { name, type } = await request.json();

    if (!name || !type) {
      return apiError('Name and type are required', 400);
    }

    const newGroup = await prisma.categoryGroup.create({
      data: {
        name,
        type,
        isCustom: true,
      },
    });

    return apiSuccess(newGroup);
  } catch (error) {
    console.error('Failed to create group:', error);
    return apiError('Failed to create group');
  }
}
