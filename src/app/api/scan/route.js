export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions"; // if alias fails, use: "../../../lib/authOptions"
import { prisma } from "@/lib/prisma";           // or "../../../lib/prisma"

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest"; // your helpers
import { computeAlerts } from "@/lib/alertsEngine";                           // your rules

function makeUniqueHash(a) {
  // daily dedupe key; matches @@unique([storeId, uniqueHash]) in Prisma
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Validate required env
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // Find connected store for this user
    const store = await prisma.store.findFirst({
      where: { userEmail: session.user.email },
    });
    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    // Fetch Shopify data (be tolerant if read_orders is missing)
    let inventory = [];
    let salesMap = {};
    try {
      inventory = await getInventoryByVariant(store.shop, store.accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
    } catch (e) {
      // If we lack read_orders scope, proceed with zero velocity
      const msg = (e?.message || "").toLowerCase();
      const scopeIssue = msg.includes("401") || msg.includes("403");
      if (scopeIssue) {
        salesMap = {};
      } else {
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
    }

    // Compute alerts
    const alerts = computeAlerts(inventory, salesMap); // returns [{ sku, product, systemQty, expectedMin, expectedMax, severity }, ...]

    // Upsert with dedupe (storeId + uniqueHash)
    if (alerts.length > 0) {
      await prisma.$transaction(
        alerts.map((a) =>
          prisma.alert.upsert({
            where: {
              storeId_uniqueHash: { storeId: store.id, uniqueHash: makeUniqueHash(a) },
            },
            update: {
              systemQty: a.systemQty,
              expectedMin: a.expectedMin,
              expectedMax: a.expectedMax,
              severity: a.severity,
              status: "open",
            },
            create: {
              userEmail: session.user.email,
              storeId: store.id,
              sku: a.sku,
              product: a.product,
              systemQty: a.systemQty,
              expectedMin: a.expectedMin,
              expectedMax: a.expectedMax,
              severity: a.severity,
              status: "open",
              uniqueHash: makeUniqueHash(a),
            },
          })
        )
      );
    }

    await prisma.store.update({
  where: { id: store.id },
  data: { lastScanAt: new Date() },
});





    return NextResponse.json({ created_or_updated: alerts.length });
  } catch (err) {
    console.error("SCAN ERROR", err);
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
