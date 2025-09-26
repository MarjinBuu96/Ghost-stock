export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { getInventoryByVariant } from "@/lib/shopifyRest";

export async function GET() {
  try {
    const cookieStore = cookies();
    const shop = cookieStore.get("shopify_shop")?.value;

    if (!shop) {
      return NextResponse.json({ count: 0, atRiskRevenue: 0, confidence: 0 });
    }

    const store = await prisma.store.findUnique({ where: { shop } });

    if (!store) {
      return NextResponse.json({ count: 0, atRiskRevenue: 0, confidence: 0 });
    }

    const alerts = await prisma.alert.findMany({
      where: { storeId: store.id, status: "open" },
      select: {
        sku: true,
        product: true,
        systemQty: true,
        expectedMin: true,
        expectedMax: true,
        severity: true,
      },
    });

    let priceMap = new Map();
    try {
      if (store.accessToken) {
        const inv = await getInventoryByVariant(store.shop, store.accessToken);
        for (const row of inv) {
          const key = row.sku || String(row.variantId);
          priceMap.set(key, typeof row.price === "number" ? row.price : 0);
        }
      }
    } catch (e) {
      // fallback to empty priceMap
    }

    const count = alerts.length;
    let atRiskRevenue = 0;
    let confidenceHits = 0;
    let confidenceTotal = 0;

    for (const a of alerts) {
      const key = a.sku;
      const price = priceMap.get(key) ?? 0;
      const deficit = Math.max((a.expectedMin ?? 0) - (a.systemQty ?? 0), 0);
      atRiskRevenue += deficit * price;

      const checks = [
        Boolean(a.sku),
        price > 0,
        typeof a.systemQty === "number",
      ];
      confidenceHits += checks.filter(Boolean).length;
      confidenceTotal += checks.length;
    }

    const confidence =
      confidenceTotal > 0
        ? Math.round((confidenceHits / confidenceTotal) * 1000) / 10
        : 100;

    return NextResponse.json({
      count,
      atRiskRevenue: Math.round(atRiskRevenue * 100) / 100,
      confidence,
    });
  } catch (err) {
    console.error("KPI route crash:", err);
    return NextResponse.json(
      { error: "server_error", details: err.message },
      { status: 500 }
    );
  }
}
