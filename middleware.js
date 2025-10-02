// src/middleware.js
import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

// Reuse this policy everywhere (you can append your other directives if you want)
const EMBED_CSP =
  "default-src 'self' https: data: blob:; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
  "style-src 'self' 'unsafe-inline' https:; " +
  "img-src 'self' https: data: blob:; " +
  "font-src 'self' https: data:; " +
  "connect-src 'self' https: wss:; " +
  "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com";

export function middleware(req) {
  const { nextUrl, cookies } = req;
  const { pathname, searchParams } = nextUrl;

  // Skip Next internals, API routes, and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Persist Shopify host param (so embeds/billing work after navigation)
  const hostFromUrl = searchParams.get("host");
  const hostFromCookie = cookies.get("shopifyHost")?.value;

  if (hostFromUrl) {
    const res = NextResponse.next();
    res.cookies.set("shopifyHost", hostFromUrl, {
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    // ✅ Ensure CSP on this response too
    res.headers.set("content-security-policy", EMBED_CSP);
    return res;
  }

  if (hostFromCookie) {
    const url = nextUrl.clone();
    url.searchParams.set("host", hostFromCookie);
    // Redirect will be followed by a new request; still set CSP on the redirect itself for consistency
    const res = NextResponse.redirect(url);
    res.headers.set("content-security-policy", EMBED_CSP);
    return res;
  }

  // Normal flow: attach CSP for ALL page responses (including 4xx)
  const res = NextResponse.next();
  res.headers.set("content-security-policy", EMBED_CSP);
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
