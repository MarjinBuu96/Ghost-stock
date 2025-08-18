export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { getInventoryByVariant } from "@/lib/shopifyRest";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ count: 0, atRiskRevenue: 0, confidence: 0 });

  // 1) Open alerts for this user
  const alerts = await prisma.alert.findMany({
    where: { userEmail: session.user.email, status: "open" },
    select: { sku: true, product: true, systemQty: true, expectedMin: true, expectedMax: true, severity: true },
  });

  // 2) Price lookup from Shopify inventory (one pass)
  const store = await prisma.store.findFirst({ where: { userEmail: session.user.email } });
  let priceMap = new Map();
  try {
    if (store?.shop && store?.accessToken) {
      const inv = await getInventoryByVariant(store.shop, store.accessToken);
      for (const row of inv) {
        const key = row.sku || String(row.variantId);
        priceMap.set(key, typeof row.price === "number" ? row.price : 0);
      }
    }
  } catch (e) {
    // If Shopify fetch fails, we’ll just assume price 0 for now.
  }

  // 3) Compute live KPIs
  const count = alerts.length;

  // At-risk = sum(max(expectedMin - systemQty, 0) * price)
  let atRiskRevenue = 0;
  let confidenceHits = 0;
  let confidenceTotal = 0;

  for (const a of alerts) {
    const key = a.sku;
    const price = priceMap.get(key) ?? 0;
    const deficit = Math.max((a.expectedMin ?? 0) - (a.systemQty ?? 0), 0);
    atRiskRevenue += deficit * price;

    // naive confidence: +1 for having SKU, +1 for having a price, +1 for non-null systemQty
    const checks = [
      Boolean(a.sku),
      price > 0,
      typeof a.systemQty === "number"
    ];
    confidenceHits += checks.filter(Boolean).length;
    confidenceTotal += checks.length;
  }

  const confidence = confidenceTotal > 0 ? Math.round((confidenceHits / confidenceTotal) * 1000) / 10 : 100;

  return NextResponse.json({
    count,
    atRiskRevenue: Math.round(atRiskRevenue * 100) / 100,
    confidence
  });
}
