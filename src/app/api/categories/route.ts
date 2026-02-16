import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';

export async function GET() {
  try {
    const [groups, categories] = await Promise.all([
      prisma.categoryGroup.findMany({ orderBy: { type: 'asc' } }),
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
    ]);

    return apiSuccess({ groups, categories });
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return apiError('Failed to fetch categories');
  }
}

export async function POST(request: Request) {
  try {
    const { name, groupId, userId } = await request.json();

    if (!name || !groupId) {
      return apiError('Name and Group are required', 400);
    }

    const newCategory = await prisma.category.create({
      data: {
        name,
        groupId,
        userId: userId || null,
      },
    });

    return apiSuccess(newCategory);
  } catch (error) {
    console.error('Failed to create category:', error);
    return apiError('Failed to create category');
  }
}
