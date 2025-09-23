export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { getInventorySnapshot } from "@/lib/shopifyRest";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store || !store.shop || !store.accessToken) {
      // Return empty set (keeps dashboard calm) instead of 401
      return NextResponse.json({ items: [], count: 0 });
    }

    // Ask for multi-location totals; function will gracefully fall back if scopes are missing
    const rows = await getInventorySnapshot(store.shop, store.accessToken, { multiLocation: true });

    return NextResponse.json({
      items: rows.slice(0, 50), // show first 50 in UI
      count: rows.length,
    });
  } catch (e) {
    console.warn("debug/inventory error:", e?.message || e);
    // Return empty payload with 200 so the page still renders
    return NextResponse.json({ items: [], count: 0, error: "inventory_fetch_failed" });
  }
}
