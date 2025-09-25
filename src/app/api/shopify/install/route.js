// src/app/api/shopify/install/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";

function buildBase() {
  const base =
    process.env.SHOPIFY_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase().trim();

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_bad_shop" }, { status: 400 });
  }

  // generate & store state
  const state = crypto.randomBytes(16).toString("hex");

  const base = buildBase();
  const redirectUri = `${base}/api/shopify/callback`;
  const scopes = process.env.SHOPIFY_SCOPES || "";

  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(authorizeUrl, 302);

  // IMPORTANT: cross-site cookie for embedded OAuth
  res.cookies.set(`shopify_state_${shop}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return res;
}
