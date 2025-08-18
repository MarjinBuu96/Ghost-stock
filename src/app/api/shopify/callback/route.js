import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { verifyHmac, exchangeToken } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

async function subscribeWebhook(shop, token, topic) {
  const res = await fetch(`https://${shop}/admin/api/2024-07/webhooks.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address: `${process.env.SHOPIFY_APP_URL}/api/shopify/webhooks`,
        format: "json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Webhook sub failed: ${topic} ${res.status} ${await res.text()}`);
}


export async function GET(req) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const shop = params.shop;
  const code = params.code;
  const state = params.state;

  // Validate shop param and state cookie
  const stateCookie = req.headers.get("cookie")?.match(/shopify_oauth_state=([^;]+)/)?.[1];
  const shopCookie = req.headers.get("cookie")?.match(/shopify_shop=([^;]+)/)?.[1];

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "Invalid shop" }, { status: 400 });
  }
  if (!stateCookie || stateCookie !== state || !shopCookie || shopCookie !== shop) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }
  if (!verifyHmac(params, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "Bad HMAC" }, { status: 400 });
  }

  // Exchange code for token
  const tokenJson = await exchangeToken({
    shop,
    code,
    clientId: process.env.SHOPIFY_API_KEY,
    clientSecret: process.env.SHOPIFY_API_SECRET,
  });

  // Save store
  await prisma.store.upsert({
    where: { shop },
    create: {
      shop,
      userEmail: session.user.email,
      accessToken: tokenJson.access_token,
    },
    update: {
      accessToken: tokenJson.access_token,
      userEmail: session.user.email,
    },
  });

  // Clean cookies and redirect to dashboard
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.set("shopify_oauth_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("shopify_shop", "", { path: "/", maxAge: 0 });
  return res;
}
