export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { shopifyGraphql, getInventoryByVariantGQL } from "@/lib/shopifyGraphql";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);

    if (!store || !store.shop || !store.accessToken) {
      console.warn("❌ Missing store or access token");
      return NextResponse.json({ items: [], count: 0, error: "missing_store_or_token" });
    }

    console.log("🔑 Using access token:", store.accessToken);

    // 🔍 Validate token with lightweight GraphQL query
    const pingQuery = `{ shop { name } }`;
    const pingRes = await shopifyGraphql(store.shop, store.accessToken, pingQuery);

    if (!pingRes?.shop?.name) {
      console.warn("debug/token-check failed:", pingRes?.errors || "no shop name");
      return NextResponse.json({ items: [], count: 0, error: "invalid_token" });
    }

    // ✅ Token is valid, fetch inventory snapshot via hardened helper
    const rows = await getInventoryByVariantGQL(store.shop, store.accessToken, { multiLocation: true });

    return NextResponse.json({
      items: rows.slice(0, 50),
      count: rows.length,
    });
  } catch (e) {
    console.warn("debug/inventory error:", e?.message || e);
    return NextResponse.json({ items: [], count: 0, error: "inventory_fetch_failed" });
  }
}
