// src/app/api/shopify/scan/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

// Read shop from cookie or header
function getShopFromRequest() {
  try {
    const c = cookies();
    const cookieShop = c.get("shopify_shop")?.value;
    if (cookieShop) return String(cookieShop).toLowerCase();
  } catch {}
  try {
    const h = nextHeaders();
    const hdrShop = h.get("x-shopify-shop-domain");
    if (hdrShop) return String(hdrShop).toLowerCase();
  } catch {}
  return null;
}

export async function POST() {
  try {
    const shop = getShopFromRequest();
    if (!shop) {
      return NextResponse.json({ error: "no_shop_in_request" }, { status: 400 });
    }

    // Find store strictly by shop domain
    const store = await prisma.store.findUnique({ where: { shop } });
    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // Inventory
    let inventory = [];
    try {
      inventory = await getInventoryByVariant(store.shop, store.accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    // Sales (optional if missing read_orders)
    let salesMap = {};
    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("401") || msg.includes("403")) {
        salesMap = {}; // treat as zero velocity if scope missing
      } else {
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
    }

    const alerts = computeAlerts(inventory, salesMap);

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
              // keep schema happy for now (email not used anymore)
              userEmail: store.shop,
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
