export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyHmac, exchangeToken } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

async function subscribeWebhook(shop, token, topic, addressBase) {
  const res = await fetch(`https://${shop}/admin/api/2024-07/webhooks.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address: `${addressBase}/api/shopify/webhooks`,
        format: "json",
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn("Webhook sub failed", topic, res.status, txt);
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // cookies set in /api/shopify/install
  const stateCookie = req.cookies.get("shopify_oauth_state")?.value;
  const shopCookie = req.cookies.get("shopify_shop")?.value;

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }
  if (!state || state !== stateCookie || !shopCookie || shopCookie !== shop) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // HMAC must validate against all query params
  const paramsObj = Object.fromEntries(url.searchParams.entries());
  if (!verifyHmac(paramsObj, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 400 });
  }

  // Exchange code
  const tokenJson = await exchangeToken({
    shop,
    code,
    clientId: process.env.SHOPIFY_API_KEY,
    clientSecret: process.env.SHOPIFY_API_SECRET,
  });
  const accessToken = tokenJson?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "token_exchange_failed" }, { status: 502 });
  }

  // Upsert store (embedded: we use shop string in userEmail to group settings)
  await prisma.store.upsert({
    where: { shop },
    create: { shop, userEmail: shop, accessToken },
    update: { accessToken },
  });

  // Subscribe to **all** required webhooks (includes compliance)
  const base = process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  await Promise.allSettled([
    subscribeWebhook(shop, accessToken, "orders/create", base),
    subscribeWebhook(shop, accessToken, "inventory_levels/update", base),
    // compliance (mandatory)
    subscribeWebhook(shop, accessToken, "customers/data_request", base),
    subscribeWebhook(shop, accessToken, "customers/redact", base),
    subscribeWebhook(shop, accessToken, "shop/redact", base),
    // optional: app/uninstalled
    subscribeWebhook(shop, accessToken, "app/uninstalled", base),
  ]);

  // Clear one-time state cookie, persist shop cookie for a year
  const res = NextResponse.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`);
  res.cookies.set("shopify_oauth_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("shopify_shop", shop, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
