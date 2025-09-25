export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function safeEquals(a, b) {
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const host = url.searchParams.get("host") || "";

  if (!shop || !code) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // 1) check state vs cookie
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)shopify_oauth_state=([^;]+)/);
  const stateCookie = m ? decodeURIComponent(m[1]) : "";
  if (!stateCookie || !safeEquals(stateCookie, state)) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // 2) exchange code for token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "token_exchange_failed" }, { status: 400 });
  }
  const { access_token } = await tokenRes.json();

  // 3) store / upsert
  await prisma.store.upsert({
    where: { shop },
    update: { accessToken: access_token, updatedAt: new Date() },
    create: {
      shop,
      accessToken: access_token,
      userEmail: shop, // embedded: we key by shop
    },
  });

  // ensure a settings row exists
  await prisma.userSettings.upsert({
    where: { userEmail: shop },
    update: {},
    create: { userEmail: shop, plan: "starter" },
  });

  // 4) go to your embedded UI with shop+host
  const appBase =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;
  const ui = `${appBase}/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;

  const res = NextResponse.redirect(ui);
  // keep a lightweight session cookie so your middleware knows you’re installed
  res.cookies.set("shopify_shop", shop, { secure: true, sameSite: "none", path: "/" });
  return res;
}
