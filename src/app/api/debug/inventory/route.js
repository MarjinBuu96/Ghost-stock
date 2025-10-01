export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { getInventorySnapshot } from "@/lib/shopifyRest";

const SHOPIFY_API_VERSION = "2025-07";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);

    if (!store || !store.shop || !store.accessToken) {
      console.warn("❌ Missing store or access token");
      return NextResponse.json({ items: [], count: 0, error: "missing_store_or_token" });
    }

    console.log("🔑 Using access token:", store.accessToken);

    // 🔍 Validate token with lightweight request
    const testRes = await fetch(`https://${store.shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!testRes.ok) {
      const errorData = await testRes.json().catch(() => ({}));
      console.warn("debug/token-check failed:", testRes.status, errorData);

      // 🔁 Redirect to re-auth if token is invalid
      if (testRes.status === 401) {
        const reauthUrl = new URL("/api/auth", req.url);
        reauthUrl.searchParams.set("shop", store.shop);
        return NextResponse.redirect(reauthUrl);
      }

      return NextResponse.json({ items: [], count: 0, error: "invalid_token" });
    }

    // ✅ Token is valid, proceed with inventory fetch
    const rows = await getInventorySnapshot(store.shop, store.accessToken, { multiLocation: true });

    return NextResponse.json({
      items: rows.slice(0, 50),
      count: rows.length,
    });
  } catch (e) {
    console.warn("debug/inventory error:", e?.message || e);
    return NextResponse.json({ items: [], count: 0, error: "inventory_fetch_failed" });
  }
}
