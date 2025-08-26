// src/app/api/shopify/callback/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
      webhook: { topic, address: `${addressBase}/api/shopify/webhooks`, format: "json" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn("Webhook sub failed", topic, res.status, txt);
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const shop = url.searchParams.get("shop");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!shop || !shop.endsWith(".myshopify.com")) {
      return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
    }

    // Read cookies via next/headers
    const jar = cookies();
    const stateCookie = jar.get("shopify_oauth_state")?.value;
    const shopCookie  = jar.get("shopify_shop")?.value;

    if (!state || state !== stateCookie || !shopCookie || shopCookie !== shop) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }

    // Validate HMAC
    const paramsObj = Object.fromEntries(url.searchParams.entries());
    if (!verifyHmac(paramsObj, process.env.SHOPIFY_API_SECRET)) {
      return NextResponse.json({ error: "bad_hmac" }, { status: 400 });
    }

    // Exchange code -> access token
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

    // Save/Update store
    await prisma.store.upsert({
      where: { shop },
      create: { shop, userEmail: shop, accessToken },
      update: { accessToken },
    });

    // Best-effort webhooks
    const base =
      process.env.SHOPIFY_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      new URL("/", req.url).toString().replace(/\/$/, "");
    Promise.allSettled([
      subscribeWebhook(shop, accessToken, "orders/create", base),
      subscribeWebhook(shop, accessToken, "inventory_levels/update", base),
    ]).catch(() => {});

    // Redirect and set session cookie for 1 year
    const res = NextResponse.redirect(new URL("/settings?connected=1", req.url));
    res.cookies.set("shopify_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("shopify_shop", shop, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    console.error("Shopify callback error:", err);
    return NextResponse.json({ error: "callback_failed", message: String(err?.message || err) }, { status: 500 });
  }
}
