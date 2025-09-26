// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Allow embedding in Shopify Admin
  const csp = [
    "default-src 'self' https: data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: wss:",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.delete("X-Frame-Options");
  return res;
}
