// src/middleware.js
import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(?:.*)$/;
const PROTECTED = ["/dashboard", "/settings"]; // pages intended for embedded use

const EMBED_CSP =
  "default-src 'self' https: data: blob:; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
  "style-src 'self' 'unsafe-inline' https:; " +
  "img-src 'self' https: data: blob:; " +
  "font-src 'self' https: data:; " +
  "connect-src 'self' https: wss:; " +
  "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com";

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};

export function middleware(req) {
  const url = req.nextUrl;
  const { pathname, searchParams } = url;

  // Skip Next internals, API routes, and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const referrer = req.headers.get("referer") || "";
  const shopHdr = req.headers.get("x-shopify-shop-domain") || "";

  const hostFromUrl = searchParams.get("host") || "";
  const hostFromCookie = req.cookies.get("shopifyHost")?.value || "";

  // Are we in an embedded context?
  const inEmbedded =
    !!hostFromUrl ||
    !!hostFromCookie ||
    referrer.includes("admin.shopify.com") ||
    referrer.includes(".myshopify.com");

  // Prepare a base response (so we can set headers/cookies consistently)
  const base = NextResponse.next();

  // CSP (and remove X-Frame-Options to allow embedding)
  base.headers.set("Content-Security-Policy", EMBED_CSP);
  base.headers.delete("X-Frame-Options");

  // Persist cookies when present
  if (hostFromUrl && hostFromUrl !== hostFromCookie) {
    base.cookies.set("shopifyHost", hostFromUrl, {
      path: "/",
      secure: true,
      sameSite: "none", // cookie must be readable in iframe
      httpOnly: false,  // client JS reads it
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  if (shopHdr) {
    base.cookies.set("shopify_shop", shopHdr.toLowerCase(), {
      path: "/",
      secure: true,
      sameSite: "none",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // ONLY add ?host=… if we are clearly in an embedded flow and the REFERRER provided it.
  // This avoids redirect loops when the cookie exists but no referrer context.
  if (!hostFromUrl && inEmbedded) {
    let refHost = "";
    try {
      const r = new URL(referrer);
      refHost = r.searchParams.get("host") || "";
    } catch {}
    if (refHost) {
      const redirectUrl = url.clone();
      redirectUrl.searchParams.set("host", refHost);
      const redir = NextResponse.redirect(redirectUrl);
      redir.headers.set("Content-Security-Policy", EMBED_CSP);
      redir.headers.delete("X-Frame-Options");
      return redir;
    }
  }

  // Block protected pages when NOT embedded (direct open in a normal tab)
  if (PROTECTED.some((p) => pathname.startsWith(p)) && !inEmbedded) {
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
      {
        status: 403,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": EMBED_CSP,
        },
      }
    );
  }

  return base;
}
