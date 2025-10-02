// src/middleware.js
import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

// Apply headers that allow embedding in Shopify Admin
function withEmbedHeaders(res) {
  try {
    res.headers.delete("X-Frame-Options");
    res.headers.delete("x-frame-options");
  } catch {}
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com;"
  );
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export function middleware(req) {
  const { nextUrl, cookies } = req;
  const { pathname, searchParams } = nextUrl;

  // Let Next internals/static pass through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hostFromUrl = searchParams.get("host");
  const hostFromCookie = cookies.get("shopifyHost")?.value || null;

  // If URL already has host: persist it and continue
  if (hostFromUrl) {
    const res = withEmbedHeaders(NextResponse.next());
    // Important: cookies inside an iframe need SameSite=None; Secure
    res.cookies.set("shopifyHost", hostFromUrl, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
    return res;
  }

  // No host in URL but we have a cookie → redirect to same URL with host
  if (hostFromCookie) {
    const url = nextUrl.clone();
    url.searchParams.set("host", hostFromCookie);
    return withEmbedHeaders(NextResponse.redirect(url));
  }

  // Public pages (no host anywhere)
  return withEmbedHeaders(NextResponse.next());
}

export const config = {
  // Run on everything except _next assets and files
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
