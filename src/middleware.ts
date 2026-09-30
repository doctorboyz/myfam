import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * First gate for pages: an unauthenticated visitor (no userId cookie)
 * is redirected to /login; an authenticated one sitting on /login is
 * sent to /dashboard. Real session validation happens in the API routes
 * (getAuthUser) — this only checks cookie presence.
 */
export function middleware(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  const { pathname } = request.nextUrl;

  if (!userId && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (userId && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // All pages except API routes, Next internals, static assets and /login.
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|login).)*',
  ],
};