// src/app/api/shopify/install/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // 1) First hit is usually inside the Shopify iframe.
  //    Return a tiny page that forces a TOP-LEVEL redirect back here with ?tld=1.
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    const html = `<!doctype html><html><body>
<script>
  // Always break out of the iframe into the top-level window
  var red = ${JSON.stringify(top.toString())};
  if (window.top === window.self) location.href = red; else window.top.location.href = red;
</script>
</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  // 2) We're now at top-level → create state and go to Shopify /authorize
  const state = crypto.randomUUID();

  // Use your public base URL (exactly what you whitelisted in the Partner Dashboard)
  const appBase =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;

  const redirectUri = `${appBase}/api/shopify/callback`;

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  // Set the real state cookie. LAX is enough for top-level navigation.
  const res = NextResponse.redirect(auth.toString());
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  // Optional: remember the shop
  res.cookies.set("shopify_shop", shop, {
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
