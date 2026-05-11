import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, getAuthUser } from '@/lib/api';

export async function GET() {
  try {
    const currentUser = await getAuthUser();
    if (!currentUser) return apiError('Not authenticated', 401);

    const tags = await prisma.tag.findMany({
      where: { deletedAt: null, familyId: currentUser.familyId },
      orderBy: { name: 'asc' },
    });

    return apiSuccess(tags);
  } catch (error) {
    console.error('Failed to fetch tags:', error);
    return apiError('Failed to fetch tags');
  }
}

export async function POST(request: Request) {
  const currentUser = await getAuthUser();
  if (!currentUser) return apiError('Not authenticated', 401);

  const body = await request.json();
  const name = (body.name || '').trim();
  if (!name) return apiError('Tag name is required', 400);

  try {
    const tag = await prisma.tag.create({
      data: {
        name,
        userId: currentUser.id,
        familyId: currentUser.familyId,
        color: body.color || null,
      },
    });

    return apiSuccess(tag, 201);
  } catch (error: unknown) {
    // Handle unique constraint violation (duplicate tag name for same user)
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      // Return existing tag instead of erroring
      const existing = await prisma.tag.findFirst({
        where: {
          name,
          userId: currentUser.id,
        },
      });
      if (existing) return apiSuccess(existing);
    }
    console.error('Failed to create tag:', error);
    return apiError('Failed to create tag');
  }
}