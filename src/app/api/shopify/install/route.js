// src/app/api/shopify/install/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // Step 0: if still in iframe, bounce to top level FIRST (no state creation yet)
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    return new Response(
      `<!doctype html><meta charset="utf-8"><script>
        var r=${JSON.stringify(top.toString())};
        if (top===self) location.href=r; else top.location.href=r;
      </script>`,
      {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // Build redirect_uri using THIS host (prevents host/cookie mismatch)
  const base = `${url.protocol}//${url.host}`;
  const redirectUri = `${base}/api/shopify/callback`;

  // Create ONCE or reuse the existing state to avoid race overwrites
  const jar = cookies();
  let state = jar.get(STATE_COOKIE)?.value;
  if (!state) state = crypto.randomUUID();

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth.toString());
  res.headers.set("Cache-Control", "no-store");

  // Lax works for top-level return; set long-lived shop cookie too
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  res.cookies.set(SHOP_COOKIE, shop, {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return res;
}
