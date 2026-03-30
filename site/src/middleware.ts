import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MARKETING_HOST = 'ambr.run';
const PLATFORM_HOST = 'getamber.dev';

// Marketing-only paths (redirect to ambr.run if accessed on getamber.dev)
const MARKETING_PATHS = ['/', '/how-it-works', '/use-cases', '/ecosystem', '/waitlist', '/privacy', '/terms'];

// Platform-only paths (redirect to getamber.dev if accessed on ambr.run)
const PLATFORM_PREFIXES = ['/docs', '/dashboard', '/reader', '/activate', '/templates', '/developers'];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const { pathname } = request.nextUrl;

  // Skip for localhost, preview URLs, and API routes
  if (
    hostname.includes('localhost') ||
    hostname.includes('127.0.0.1') ||
    hostname.includes('vercel.app') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/_next/') ||
    pathname.match(/\.\w+$/) // static files
  ) {
    return NextResponse.next();
  }

  // On ambr.run → redirect platform paths to getamber.dev
  if (hostname.includes(MARKETING_HOST)) {
    const isPlatformPath = PLATFORM_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (isPlatformPath) {
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, `https://${PLATFORM_HOST}`),
        307,
      );
    }
  }

  // On getamber.dev → redirect marketing paths to ambr.run
  if (hostname.includes(PLATFORM_HOST)) {
    const isMarketingPath = MARKETING_PATHS.includes(pathname);
    if (isMarketingPath) {
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, `https://${MARKETING_HOST}`),
        307,
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|apple-icon.png).*)',
  ],
};
