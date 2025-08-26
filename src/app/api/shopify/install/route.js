// src/app/api/shopify/install/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";

function randomState() {
  return crypto.randomBytes(16).toString("hex");
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");

  // Basic validation
  if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  // Env validation
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET; // not used here, but ensure present
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "missing_shopify_env" }, { status: 500 });
  }

  // Scopes for your app
  const scopes =
    process.env.SHOPIFY_SCOPES ||
    "read_products,read_inventory,read_orders";

  // Callback base URL
  const base =
    process.env.SHOPIFY_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL("/", req.url).toString().replace(/\/$/, "");

  const callback = `${base}/api/shopify/callback`;

  // CSRF state
  const state = randomState();

  // Build Shopify authorize URL
  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(callback)}` +
    `&state=${encodeURIComponent(state)}`;

  // Sanity log (no secrets)
  console.log(
    "Shopify OAuth redirect:",
    JSON.stringify({ shop, clientIdLen: String(clientId).length, callback, scopes })
  );

  // Redirect and set validation cookies
  const res = NextResponse.redirect(authorizeUrl, 307);
  res.cookies.set("shopify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set("shopify_shop", shop, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
