import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to handle LIFF routing.
 *
 * - Strips /liff prefix if the endpoint URL is configured with /liff
 * - Adds LIFF detection headers for client-side use
 * - Sets reasonable cache headers for HTML pages
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, and _next
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Strip /liff prefix from incoming URLs
  // This handles the case where the LIFF endpoint URL is set to
  // https://myfam.doctorboyz.com/liff instead of https://myfam.doctorboyz.com
  if (pathname.startsWith('/liff')) {
    const newPath = pathname.slice('/liff'.length) || '/';
    const url = request.nextUrl.clone();
    url.pathname = newPath;
    return NextResponse.rewrite(url);
  }

  const response = NextResponse.next();

  // Pass LIFF detection to client via response headers
  const userAgent = request.headers.get('user-agent') || '';
  const isLiff = userAgent.includes('Line/') || request.headers.get('x-line-channelid') !== null;
  response.headers.set('x-liff-mode', isLiff ? 'true' : 'false');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};