import { apiSuccess, apiError } from '@/lib/api';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('userId');
    return apiSuccess({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return apiError('Logout failed');
  }
}
