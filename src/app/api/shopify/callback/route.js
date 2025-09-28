export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyOAuthQueryHmac } from "@/lib/shopifyHmac";

const STATE_MAX_AGE_MS = 15 * 60 * 1000;
const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";
const SHOPIFY_API_VERSION = "2025-07";

async function ensureComplianceWebhooks(shop, accessToken, appOrigin) {
  const address = `${appOrigin}/api/shopify/webhooks`;
  const base = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;
  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
  const payloads = [
    { webhook: { topic: "customers/data_request", address, format: "json" } },
    { webhook: { topic: "customers/redact",       address, format: "json" } },
    { webhook: { topic: "shop/redact",            address, format: "json" } },
  ];
  for (const body of payloads) {
    try {
      await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      console.error("⚠️ Webhook registration failed:", body.webhook.topic, e);
    }
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const state = url.searchParams.get("state") || "";
  const hmac = url.searchParams.get("hmac") || "";

  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  if (!verifyOAuthQueryHmac(url.searchParams, hmac, process.env.SHOPIFY_API_SECRET || "")) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  let rec = null;
  try {
    rec = await prisma.oAuthState.findUnique({ where: { state } });
  } catch (err) {
    console.warn("⚠️ Failed to fetch OAuth state:", err);
  }

  const recOk = !!rec && rec.shop === shop &&
    Date.now() - rec.createdAt.getTime() <= STATE_MAX_AGE_MS;

  const cookieState = cookies().get(STATE_COOKIE)?.value || "";
  const cookieOk = cookieState && cookieState === state;

  if (!recOk && !cookieOk) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  if (recOk) {
    try {
      await prisma.oAuthState.delete({ where: { state } });
    } catch (err) {
      console.warn("⚠️ Failed to delete OAuth state:", err);
    }
  }

  const code = url.searchParams.get("code") || "";
  const tokenUrl = `https://${shop}/admin/oauth/access_token`;

  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY || "",
      client_secret: process.env.SHOPIFY_API_SECRET || "",
      code,
    }),
  });

  const payload = await r.json().catch(() => ({}));
  if (!r.ok || !payload?.access_token) {
    console.error("❌ Token exchange failed:", payload);
    return NextResponse.json({ error: "token_exchange_failed" }, { status: 400 });
  }

  const accessToken = payload.access_token;

  try {
    await prisma.store.upsert({
      where: { shop },
      update: { accessToken, updatedAt: new Date() },
      create: {
        shop,
        accessToken,
        userEmail: shop,
        createdAt: new Date(),
      },
    });
    console.log("✅ Store upserted:", shop);
  } catch (err) {
    console.error("❌ Failed to upsert store:", err);
    return NextResponse.json({ error: "store_upsert_failed" }, { status: 500 });
  }

  await ensureComplianceWebhooks(shop, accessToken, url.origin);

  const res = NextResponse.redirect(new URL("/dashboard", url.origin));
  res.cookies.set(SHOP_COOKIE, shop, {
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
