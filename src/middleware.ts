import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  // Match all paths except API and Next.js internals
  matcher: ["/((?!api|_next|favicon\\.ico).*)"],
};

const PROTECTED_PATHS = ["/dashboard", "/settings"]; // add more if needed

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const res = NextResponse.next();

  // ---------- Skip static assets ----------
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|txt)$/)) {
    return res;
  }

  // ---------- Security headers (embedded app) ----------
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

  // ---------- Read host/shop from request ----------
  const qHost = url.searchParams.get("host") || "";
  const referrer = req.headers.get("referer") || "";
  const hdrShop = req.headers.get("x-shopify-shop-domain") || "";
  const cookieHost = req.cookies.get("shopifyHost")?.value || "";
  const cookieShop = req.cookies.get("shopify_shop")?.value || "";

  // ---------- Persist cookies ----------
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
  if (hdrShop && hdrShop !== cookieShop) {
    res.cookies.set("shopify_shop", hdrShop.toLowerCase(), cookieInit);
  }

  // ---------- Preserve `host` ----------
  if (!qHost) {
    const refHost = (() => {
      try {
        const r = new URL(referrer);
        return r.searchParams.get("host") || "";
      } catch {
        return "";
      }
    })();

    const fallbackHost = refHost || cookieHost;
    if (fallbackHost) {
      const redirectUrl = url.clone();
      redirectUrl.searchParams.set("host", fallbackHost);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // ---------- Block protected pages ----------
  const isProtected = PROTECTED_PATHS.some((p) => url.pathname.startsWith(p));
  const looksEmbedded =
    !!qHost ||
    referrer.includes("admin.shopify.com") ||
    referrer.includes(".myshopify.com") ||
    !!cookieHost;

  if (isProtected && !looksEmbedded) {
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
        },
      }
    );
  }

  return res;
}
