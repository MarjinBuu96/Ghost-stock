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

  // 1) If we’re still in an iframe, bounce to the top level
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    return new Response(
      `<!doctype html><meta charset="utf-8"><script>
        var r=${JSON.stringify(top.toString())};
        if (top===self) location.href=r; else top.location.href=r;
      </script>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // 2) Build redirect_uri using THIS request’s host (prevents cookie/host mismatch)
  const base = `${url.protocol}//${url.host}`;               // <-- critical
  const redirectUri = `${base}/api/shopify/callback`;

  // 3) Create and store state
  const state = crypto.randomUUID();

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth.toString());

  // Lax is sent on top-level return from Shopify
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  res.cookies.set("shopify_shop", shop, {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return res;
}
