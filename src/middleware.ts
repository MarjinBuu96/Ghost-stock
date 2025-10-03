// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  // Match all pages except API and Next.js internals & static files
  matcher: ["/((?!api|_next|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|css|js|map)).*)"],
};

// Only these routes must be opened inside the Shopify Admin iframe
const EMBED_ONLY_PATHS = ["/dashboard"];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const res = NextResponse.next();

  // ---------- Security headers (safe to send always) ----------
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

  // ---------- Read existing values ----------
  const qHost = url.searchParams.get("host") || "";
  const referrer = req.headers.get("referer") || "";
  const hdrShop = req.headers.get("x-shopify-shop-domain") || "";
  const cookieHost = req.cookies.get("shopifyHost")?.value || "";
  const cookieShop = req.cookies.get("shopify_shop")?.value || "";

  // ---------- Persist cookies (no redirects) ----------
  const cookieInit = {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "none" as const,
    maxAge: 60 * 60 * 24 * 365,
  };

  if (qHost && qHost !== cookieHost) {
    res.cookies.set("shopifyHost", qHost, cookieInit);
  }
  if (hdrShop && hdrShop.toLowerCase() !== cookieShop) {
    res.cookies.set("shopify_shop", hdrShop.toLowerCase(), cookieInit);
  }

  // ---------- Do NOT redirect to inject `host` ----------
  // (standalone pages should load without a host param)

  // ---------- Gate only embed-only routes ----------
  const isEmbedOnly = EMBED_ONLY_PATHS.some((p) => url.pathname.startsWith(p));
  const looksEmbedded =
    !!qHost ||
    /admin\.shopify\.com/.test(referrer) ||
    /\.myshopify\.com/.test(referrer) ||
    !!cookieHost;

  if (isEmbedOnly && !looksEmbedded) {
    return new NextResponse(
      `<!doctype html>
<html><head><meta charset="utf-8"><title>Ghost Stock</title></head>
<body style="font:14px system-ui;background:#0b0f17;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
  <div style="max-width:560px;padding:24px;border:1px solid #374151;border-radius:12px;background:#111827">
    <h1 style="margin:0 0 8px;font-size:20px">Open from Shopify Admin</h1>
    <p style="margin:0 0 16px;color:#9ca3af">
      This page is only available inside the Shopify Admin embedded app.
      Go to <b>Apps → Ghost Stock</b> in your store’s admin to access it.
    </p>
  </div>
</body></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  return res;
}
