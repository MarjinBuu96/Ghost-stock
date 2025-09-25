// src/app/api/shopify/callback/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";

function verifyCallbackHmac(search, secret) {
  // Build the message by sorting params and excluding hmac & signature
  const params = [];
  for (const [k, v] of search) {
    if (k === "hmac" || k === "signature") continue;
    params.push([k, v]);
  }
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = params.map(([k, v]) => `${k}=${v}`).join("&");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(search.get("hmac") || "", "utf8"));
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const hmac = url.searchParams.get("hmac") || "";

  if (!shop || !code || !state || !hmac) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // 1) Compare state with cookie
  const cookies = req.headers.get("cookie") || "";
  const expectedState = (cookies.match(new RegExp(`${STATE_COOKIE}=([^;]+)`)) || [])[1] || "";
  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // 2) Verify HMAC from Shopify
  if (!verifyCallbackHmac(url.searchParams, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 3) Exchange code for access_token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "token_exchange_failed", status: tokenRes.status }, { status: 401 });
  }

  const tokenJson = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenJson.access_token;

  if (!accessToken) {
    return NextResponse.json({ error: "no_access_token" }, { status: 401 });
  }

  // 4) Upsert store
  await prisma.store.upsert({
    where: { shop },
    update: { accessToken, updatedAt: new Date() },
    create: {
      shop,
      accessToken,
      userEmail: shop, // embedded model: use shop as identity key
    },
  });

  // 5) Clear state cookie and set convenience cookie
  const base =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;

  const res = NextResponse.redirect(`${base}/dashboard?shop=${encodeURIComponent(shop)}&installed=1`);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set("shopify_shop", shop, {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return res;
}
