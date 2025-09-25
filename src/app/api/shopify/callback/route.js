// src/app/api/shopify/callback/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function hmacValid(searchParams) {
  const params = new URLSearchParams(searchParams);
  const hmac = params.get("hmac") || "";
  params.delete("hmac");
  // Shopify requires sorted querystring
  const msg = new URLSearchParams([...params.entries()].sort()).toString();
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(msg)
    .digest("hex");
  // timing-safe compare
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "utf8"), Buffer.from(digest, "utf8"));
  } catch {
    return false;
  }
}

function baseUrl() {
  return (process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/,"");
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!shop || !code || !state) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // 1) Validate HMAC on the query (recommended)
  if (!hmacValid(url.searchParams)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 2) Validate state from cookie
  const cookieName = `shopify_state_${shop}`;
  const expected = req.cookies.get(cookieName)?.value;
  if (!expected || expected !== state) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // clear the state cookie
  const clearState = NextResponse.next();
  clearState.cookies.set(cookieName, "", { path: "/", maxAge: 0 });

  // 3) Exchange code for access token
  const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  const tok = await tokenResp.json().catch(() => ({}));
  const accessToken = tok?.access_token;
  if (!tokenResp.ok || !accessToken) {
    return NextResponse.json({ error: "token_exchange_failed", details: tok }, { status: 401 });
  }

  // 4) Save store
  const store = await prisma.store.upsert({
    where: { shop },
    update: { accessToken },
    create: { shop, accessToken, userEmail: shop }, // you use shop as userEmail in embedded mode
    select: { id: true },
  });

  // 5) Redirect to your app UI (embedded)
  const to = `${baseUrl()}/dashboard`;
  const res = NextResponse.redirect(to, 302);
  // Set your own session cookies if your app expects them
  res.cookies.set("active_store_id", store.id, { path: "/", sameSite: "lax" });
  res.cookies.set("shop", shop, { path: "/", sameSite: "lax" });
  // also clear state cookie in the final response
  res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
  return res;
}
