import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { shopifyAuthUrl } from "@/lib/shopify";

export async function GET(req) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const shop = searchParams.get("shop");
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "Invalid shop" }, { status: 400 });
  }

  const state = cryptoRandomString();
  const url = shopifyAuthUrl({
    shop,
    state,
    scopes: process.env.SHOPIFY_SCOPES,
    clientId: process.env.SHOPIFY_API_KEY,
    redirectUri: `${process.env.SHOPIFY_APP_URL}/api/shopify/callback`,
  });

  // stash state in a cookie to validate later
  const res = NextResponse.redirect(url);
  res.cookies.set("shopify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set("shopify_shop", shop, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

import cryptoNode from "crypto";
function cryptoRandomString() {
  return cryptoNode.randomBytes(16).toString("hex");
    
    
}
