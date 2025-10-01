import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const REDIRECT_URI = "https://ghost-stock.co.uk/api/shopify/callback";

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop.endsWith(".myshopify.com")) {
    console.warn("❌ Invalid shop domain:", shop);
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  const state = crypto.randomUUID();
  await prisma.oAuthState.create({
    data: { shop, state, createdAt: new Date() },
  });

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=read_products,write_products&redirect_uri=${REDIRECT_URI}&state=${state}`;

  const res = NextResponse.redirect(installUrl);
  res.cookies.set(STATE_COOKIE, state, {
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 15 * 60,
  });

  console.log("🚀 Redirecting to Shopify OAuth for:", shop);
  return res;
}
