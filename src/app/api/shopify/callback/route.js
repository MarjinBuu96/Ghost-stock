export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// (reuse your existing HMAC verification for query params)
import { verifyOAuthQueryHmac } from "@/lib/shopifyHmac"; // or inline util

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export async function GET(req) {
  const url = new URL(req.url);
  const shop  = (url.searchParams.get("shop")  || "").toLowerCase();
  const state = url.searchParams.get("state") || "";
  const hmac  = url.searchParams.get("hmac")  || "";

  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }
  if (!verifyOAuthQueryHmac(url.searchParams, hmac, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // ✅ DB-based state validation (no iframe cookie dependency)
  const rec = await prisma.oAuthState.findUnique({ where: { state } }).catch(() => null);
  if (!rec || rec.shop !== shop || (Date.now() - rec.createdAt.getTime()) > STATE_MAX_AGE_MS) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }
  // one-time use
  await prisma.oAuthState.delete({ where: { state } }).catch(() => {});

  // Exchange code -> access_token (your existing code)
  const code = url.searchParams.get("code") || "";
  // ... POST to https://{shop}/admin/oauth/access_token ...
  // ... upsert store, set cookies, redirect to /dashboard (or /) ...

  return NextResponse.redirect(new URL("/", url.origin));
}
