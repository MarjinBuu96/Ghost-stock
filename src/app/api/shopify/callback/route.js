export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";

function verifyCallbackHmac(search, secret) {
  const pairs = [];
  for (const [k, v] of search) if (k !== "hmac" && k !== "signature") pairs.push([k, v]);
  pairs.sort(([a],[b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = pairs.map(([k,v]) => `${k}=${v}`).join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const given  = search.get("hmac") || "";
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(given, "utf8"));
  } catch {
    return false;
  }
}

export async function GET(req) {
  const url  = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  if (!shop || !code || !state) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // 1) Compare state cookie
  const jar = cookies();
  const expected = jar.get(STATE_COOKIE)?.value || "";
  if (!expected || expected !== state) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // 2) Verify HMAC
  if (!verifyCallbackHmac(url.searchParams, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 3) Exchange code
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
    return NextResponse.json({ error: "token_exchange_failed", status: tokenRes.status }, { status: 401 });
  }
  const { access_token } = await tokenRes.json();
  if (!access_token) return NextResponse.json({ error: "no_access_token" }, { status: 401 });

  await prisma.store.upsert({
    where: { shop },
    update: { accessToken: access_token, updatedAt: new Date() },
    create: { shop, accessToken: access_token, userEmail: shop },
  });

  // 4) Clear state cookie and send user to the app UI on THIS host
  const base = `${url.protocol}//${url.host}`;
  const res  = NextResponse.redirect(`${base}/dashboard?shop=${encodeURIComponent(shop)}&installed=1`);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set("shopify_shop", shop, { secure: true, sameSite: "lax", path: "/", maxAge: 365*24*60*60 });
  return res;
}

