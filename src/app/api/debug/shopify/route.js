// src/app/api/debug/shopify/route.js  (or wherever this lives)
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const SHOPIFY_API_VERSION = "2025-07";
const REQUIRED_SCOPES = ["read_products", "read_inventory", "read_orders"];

async function shopifyGet(shop, token, path) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${path}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* leave undefined */ }

  if (!res.ok) {
    const message = json?.errors || json?.error || text || `HTTP ${res.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return json ?? text; // prefer JSON, fallback to raw text
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const store = await prisma.store.findFirst({
      where: { userEmail: session.user.email },
      select: { shop: true, accessToken: true },
    });

    if (!store?.shop || !store?.accessToken) {
      return NextResponse.json({ error: "no_store" }, { status: 400 });
    }

    // Safe REST endpoints (not deprecated)
    const shopResp = await shopifyGet(store.shop, store.accessToken, "shop.json");
    const scopesResp = await shopifyGet(store.shop, store.accessToken, "oauth/access_scopes.json");

    const granted = Array.isArray(scopesResp?.access_scopes)
      ? scopesResp.access_scopes.map(s => s.handle)
      : [];

    const grantedSet = new Set(granted);
    const missing = REQUIRED_SCOPES.filter(s => !grantedSet.has(s));

    return NextResponse.json({
      ok: true,
      shop: shopResp?.shop ?? null,
      scopes: granted,
      required_scopes: REQUIRED_SCOPES,
      missing_scopes: missing,
      api_version: SHOPIFY_API_VERSION,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "debug_shopify_failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
