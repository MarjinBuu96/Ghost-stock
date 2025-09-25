import { NextResponse } from "next/server";

export function middleware(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // never touch API or static
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const shop = url.searchParams.get("shop");
  const shopCookie = req.cookies.get("shopify_shop")?.value;

  // If Shopify opens our app (with ?shop=...), and we don't have a session cookie yet,
  // kick off OAuth immediately.
  if (shop && !shopCookie) {
    const installUrl = new URL(`/api/shopify/install`, req.url);
    installUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(installUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};
