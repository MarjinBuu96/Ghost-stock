// src/app/api/shopify/install/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE  = "shopify_shop";

function shopFromHostParam(hostB64?: string | null): string | null {
  if (!hostB64) return null;
  try {
    const decoded = Buffer.from(hostB64, "base64").toString("utf8");
    // decoded like: "admin.shopify.com/store/ghost-app" or ".../stores/ghost-app"
    const m = decoded.match(/\/store[s]?\/([^/?#]+)/i);
    if (!m) return null;
    const shopPrefix = m[1]; // "ghost-app"
    return `${shopPrefix}.myshopify.com`.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url  = new URL(req.url);
  let shop = (url.searchParams.get("shop") || "").toLowerCase();

  // If embedded passed admin.shopify.com (or empty), recover shop from host=...
  if (!shop.endsWith(".myshopify.com")) {
    const fromHost = shopFromHostParam(url.searchParams.get("host"));
    if (!fromHost) {
      return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
    }
    shop = fromHost;
  }

  // One-time bounce out of iframe so OAuth can complete in top-level
  if (url.searchParams.get("tld") !== "1") {
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

  const clientId    = process.env.SHOPIFY_API_KEY;
  const scopes      = process.env.SHOPIFY_SCOPES || "";        // e.g. "read_products,read_orders"
  const redirectUri = process.env.SHOPIFY_APP_URL;             // MUST be your callback route URL

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error: "missing_env_vars",
        details: { SHOPIFY_API_KEY: !!clientId, SHOPIFY_APP_URL: !!redirectUri },
      },
      { status: 500 }
    );
  }

  try {
    const state = randomUUID();
    await prisma.oAuthState.create({ data: { state, shop } });

    const auth = new URL(`https://${shop}/admin/oauth/authorize`);
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("scope", scopes);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("state", state);
    // keep online token (per-user) or remove if you want offline tokens instead
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
  } catch (err: any) {
    console.error("Install route crash:", err);
    return NextResponse.json({ error: "server_error", details: err.message }, { status: 500 });
  }
}
