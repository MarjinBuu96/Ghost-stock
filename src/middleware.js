// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // run on all app pages, but skip API and static and webhooks
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // --- do not touch API/static (extra guard, matcher already skips these) ---
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // --- Shopify top-level OAuth kick-off if no session cookie yet ---
  const shop = url.searchParams.get("shop");
  const shopCookie = req.cookies.get("shopify_shop")?.value;

  if (shop && !shopCookie) {
    const installUrl = new URL("/api/shopify/install", req.url);
    installUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(installUrl);
  }

  // --- Allow embedding inside Shopify (critical for avoiding “refused to connect”) ---
  const res = NextResponse.next();

  const csp = [
    "default-src 'self' https: data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: wss:",
    // The line that lets Shopify Admin embed your app
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com",
    // (Optional) if you open external links in iframes you can also add:
    // "frame-src https: data:",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  // Some frameworks add this; if present it blocks embedding — remove it.
  res.headers.delete("X-Frame-Options");

  return res;
}
