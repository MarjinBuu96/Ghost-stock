// src/app/api/shopify/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyOAuthQueryHmac } from "@/lib/shopifyHmac";

const STATE_MAX_AGE_MS = 15 * 60 * 1000;
const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";

export async function GET(req) {
  const url = new URL(req.url);
  const shop  = (url.searchParams.get("shop")  || "").toLowerCase();
  const state = url.searchParams.get("state") || "";
  const hmac  = url.searchParams.get("hmac")  || "";
  const host  = url.searchParams.get("host")  || "";

  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_env_secret" }, { status: 500 });
  }

  if (!verifyOAuthQueryHmac(url.searchParams, hmac, secret)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  const rec = await prisma.oAuthState.findUnique({ where: { state } }).catch(() => null);
  const recOk =
    !!rec &&
    rec.shop === shop &&
    Date.now() - rec.createdAt.getTime() <= STATE_MAX_AGE_MS;

  const cookieState = cookies().get(STATE_COOKIE)?.value || "";
  const cookieOk = cookieState && cookieState === state;

  if (!recOk && !cookieOk) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  if (recOk) {
    await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
  }

  const code = url.searchParams.get("code") || "";
  const tokenUrl = `https://${shop}/admin/oauth/access_token`;

  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "missing_env_creds" }, { status: 500 });
  }

  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const payload = await r.json().catch(() => ({}));
  if (!r.ok || !payload?.access_token) {
    return NextResponse.json({ error: "token_exchange_failed" }, { status: 400 });
  }

  const accessToken = payload.access_token;

  await prisma.store.upsert({
    where:  { shop },
    update: { accessToken, updatedAt: new Date() },
    create: { shop, accessToken, userEmail: shop, createdAt: new Date() },
  });

  const redirectUrl = new URL("/dashboard", url.origin);
  redirectUrl.searchParams.set("shop", shop);
  redirectUrl.searchParams.set("host", host);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(SHOP_COOKIE, shop, {
    secure:   true,
    sameSite: "none",
    path:     "/",
    maxAge:   365 * 24 * 60 * 60,
  });
  res.headers.set("Cache-Control", "no-store");

  return res;
}
