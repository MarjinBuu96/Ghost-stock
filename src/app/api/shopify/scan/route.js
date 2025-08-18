export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";   // use relative path if alias fails
import { prisma } from "@/lib/prisma";             // use relative path if alias fails

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

// daily dedupe key; matches @@unique([storeId, uniqueHash]) in Prisma
function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // Find connected store
    const store = await prisma.store.findFirst({
      where: { userEmail: session.user.email },
    });
    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    // Fetch inventory (required) and orders (optional)
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
      // If orders scope is missing, proceed assuming zero recent sales
      const msg = (e?.message || "").toLowerCase();
      const missingScope = msg.includes("401") || msg.includes("403");
      if (!missingScope) {
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
      salesMap = {};
    }

    // Compute alerts
    const alerts = computeAlerts(inventory, salesMap);

    // Upsert alerts with dedupe (storeId + uniqueHash)
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

    return NextResponse.json({ created_or_updated: alerts.length });
  } catch (err) {
    console.error("SCAN ERROR", err);
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
