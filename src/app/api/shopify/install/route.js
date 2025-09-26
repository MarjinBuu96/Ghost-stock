export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";

export async function GET(req) {
  const url  = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // If we’re still in an iframe, bounce to top-level once
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    return new Response(
      `<!doctype html><script>var r=${JSON.stringify(top.toString())};
      if (top===self) location.href=r; else top.location.href=r;</script>`,
      { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }
    );
  }

  const base        = `${url.protocol}//${url.host}`;
  const redirectUri = `${base}/api/shopify/callback`;

  // Generate a fresh state and **persist it**
  const state = crypto.randomUUID();
  await prisma.oAuthState.create({ data: { state, shop } });

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth.toString());
  res.headers.set("Cache-Control", "no-store");

  // Optional: also set cookie; not relied upon for verification
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure:   true,
    sameSite: "none",
    path:     "/",
    maxAge:   10 * 60,
  });
  res.cookies.set(SHOP_COOKIE, shop, {
    secure:   true,
    sameSite: "none",
    path:     "/",
    maxAge:   365 * 24 * 60 * 60,
  });

  return res;
}
