export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req) {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`;
  const scopes = (process.env.SHOPIFY_SCOPES || "").split(",").map(s => s.trim()).join(",");

  const authUrl =
    `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(authUrl);
  // persist state and shop for callback validation
  res.cookies.set("shopify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set("shopify_shop", shop, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
