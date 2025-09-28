export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_COOKIE = "shopify_shop";

/** Resolve a valid *.myshopify.com shop from query, cookie, or embedded header */
async function resolveShop(url: URL): Promise<string | null> {
  let shop = (url.searchParams.get("shop") || "").toLowerCase();

  const looksBad = !shop.endsWith(".myshopify.com") || shop === "admin.shopify.com";
  if (looksBad) {
    // In Next 15 these are async
    const cVal = (await cookies()).get(SHOP_COOKIE)?.value?.toLowerCase();
    const hVal = (await nextHeaders()).get("x-shopify-shop-domain")?.toLowerCase();

    if (cVal?.endsWith(".myshopify.com")) shop = cVal;
    else if (hVal?.endsWith(".myshopify.com")) shop = hVal;
  }

  return shop && shop.endsWith(".myshopify.com") ? shop : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shop = await resolveShop(url);

  if (!shop) {
    return NextResponse.json({ error: "missing_or_invalid_shop" }, { status: 400 });
  }

  // Bounce out of iframe once; carry corrected shop forward
  if (url.searchParams.get("tld") !== "1") {
    const top = new URL(req.url);
    top.searchParams.set("tld", "1");
    top.searchParams.set("shop", shop);
    return new Response(
      `<!doctype html><script>
        var r=${JSON.stringify(top.toString())};
        if (top===self) location.href=r; else top.location.href=r;
      </script>`,
      { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }
    );
  }

  const clientId = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || "";
  const redirectUri = process.env.SHOPIFY_APP_URL; // should be your callback URL

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "missing_env_vars", details: { SHOPIFY_API_KEY: !!clientId, SHOPIFY_APP_URL: !!redirectUri } },
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
    auth.searchParams.set("grant_options[]", "per-user"); // online token

    const res = NextResponse.redirect(auth.toString());
    res.headers.set("Cache-Control", "no-store");

    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 10 * 60,
    });

    // refresh/ensure the correct shop is stored client-side
    res.cookies.set(SHOP_COOKIE, shop, {
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });

    return res;
  } catch (err: any) {
    console.error("Install route crash:", err);
    return NextResponse.json({ error: "server_error", details: err.message }, { status: 500 });
  }
}
