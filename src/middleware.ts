
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
};

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Set security headers for Shopify embedding
  const csp = [
    "default-src 'self' https: data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: wss:",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com",
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);
  res.headers.delete('X-Frame-Options');

  // ---- BEGIN: Host query param preservation logic ----
  const url = req.nextUrl;
  const host = url.searchParams.get('host');

  // If host is missing but referrer has it, redirect to include it
  if (!host) {
    const referer = req.headers.get('referer');
    if (referer && referer.includes('host=')) {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.searchParams.get('host');

      if (refererHost) {
        url.searchParams.set('host', refererHost);
        return NextResponse.redirect(url);
      }
    }
  }
  // ---- END ----

  return res;
}
