import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const [groups, categories] = await Promise.all([
      prisma.categoryGroup.findMany({ where: { deletedAt: null }, orderBy: { type: 'asc' } }),
      prisma.category.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    ]);

    return apiSuccess({ groups, categories });
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return apiError('Failed to fetch categories');
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const { name, groupId } = await request.json();

    if (!name || !groupId) {
      return apiError('Name and Group are required', 400);
    }

    const newCategory = await prisma.category.create({
      data: {
        name,
        groupId,
        userId: currentUser.id,
      },
    });

    return apiSuccess(newCategory);
  } catch (error) {
    console.error('Failed to create category:', error);
    return apiError('Failed to create category');
  }
}
