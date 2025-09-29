// src/middleware.js
import { NextResponse } from "next/server";

// Skip Next.js internals, API routes, and static assets
const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req) {
  const { nextUrl, cookies } = req;
  const { pathname, searchParams } = nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hostFromUrl = searchParams.get("host");
  const hostFromCookie = cookies.get("shopifyHost")?.value;

  // If URL already has host, persist it and continue
  if (hostFromUrl) {
    const res = NextResponse.next();
    res.cookies.set("shopifyHost", hostFromUrl, {
      path: "/",
      sameSite: "lax",
    });
    return res;
  }

  // If URL is missing host but cookie exists, redirect to same path with host
  if (hostFromCookie) {
    const url = nextUrl.clone();
    url.searchParams.set("host", hostFromCookie);
    return NextResponse.redirect(url);
  }

  // No host anywhere → allow (e.g., public landing)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
