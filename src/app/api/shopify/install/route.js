// src/app/api/shopify/install/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";

export async function GET(req) {
  const url  = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // Only bounce to top-level if not embedded and not already redirected
  const isEmbedded = url.searchParams.get("embedded") === "1";
  const isTopLevel = url.searchParams.get("tld") === "1";

  if (isEmbedded && !isTopLevel) {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    return new Response(
      `<!doctype html><script>
        var r=${JSON.stringify(top.toString())};
        if (top===self) location.href=r; else top.location.href=r;
      </script>`,
      { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }
    );
  }

  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const clientId    = process.env.SHOPIFY_API_KEY;
  const scopes      = process.env.SHOPIFY_SCOPES || "";

  if (!redirectUri || !clientId) {
    return NextResponse.json({ error: "missing_env_vars" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  await prisma.oAuthState.create({ data: { state, shop } });

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("scope", scopes);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);
  auth.searchParams.set("grant_options[]", "per-user");

  const res = NextResponse.redirect(auth.toString());
  res.headers.set("Cache-Control", "no-store");

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
