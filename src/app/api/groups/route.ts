import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api';

export async function POST(request: Request) {
  try {
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
