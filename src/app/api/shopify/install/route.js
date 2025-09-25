export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Top-level OAuth starter. If we’re still in an iframe (no top-level cookie),
 * return an HTML page that breaks out to the parent and re-hits this route.
 * On the second hit, set the state cookie and redirect to Shopify /authorize.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // if we haven’t done the top-level hop yet, do it now
  const topLevelCookie = req.headers.get("cookie")?.includes("shopify_top_level=1");
  const tld = url.searchParams.get("tld");
  if (!topLevelCookie || tld !== "1") {
    const next = new URL(req.url);
    next.searchParams.set("tld", "1");
    const html = `<!DOCTYPE html><html><body>
<script>
  // mark we've reached top-level once
  document.cookie = "shopify_top_level=1; Path=/; SameSite=None; Secure";
  var red = ${JSON.stringify(next.toString())};
  if (window.top === window.self) location.href = red; else window.top.location.href = red;
</script>
</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  // now we *are* top-level; create state + redirect to Shopify /authorize
  const state = crypto.randomUUID();

  const appBase =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;

  const redirectUri = `${appBase}/api/shopify/callback`;

  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  auth.searchParams.set("scope", process.env.SHOPIFY_SCOPES || "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);
  // optional: per-user tokens
  // auth.searchParams.append("grant_options[]", "per-user");

  const res = NextResponse.redirect(auth.toString());
  // IMPORTANT: SameSite=None + Secure so it survives Shopify’s iframe journey
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.cookies.set("shopify_shop", shop, {
    secure: true,
    sameSite: "none",
    path: "/",
  });
  return res;
}
