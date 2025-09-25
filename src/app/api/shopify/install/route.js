// src/app/api/shopify/install/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";

const STATE_COOKIE = "shopify_oauth_state";

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // 1) First hit is likely in an iframe -> break out to top level
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    const html = `<!doctype html><meta charset="utf-8"><script>
      var red=${JSON.stringify(top.toString())};
      if (top===self) location.href=red; else top.location.href=red;
    </script>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  // 2) Now at top level -> set state cookie and redirect to Shopify /authorize
  const state = crypto.randomUUID();

  const base =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;

  const redirectUri = `${base}/api/shopify/callback`;

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth.toString());

  // LAX is sent on top-level navigations back from Shopify
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 min
  });
  res.cookies.set("shopify_shop", shop, {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return res;
}
