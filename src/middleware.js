import { NextResponse } from "next/server";

export function middleware(req) {
  const res = NextResponse.next();
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://*.myshopify.com https://admin.shopify.com",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "ALLOWALL"); // CSP frame-ancestors is the real control
  return res;
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
