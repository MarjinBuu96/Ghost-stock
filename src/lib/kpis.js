import { prisma } from "@/lib/prisma";
import { getInventoryByVariantGQL } from "@/lib/shopifyGraphql";

export async function computeKpisForUser(userEmail) {
  const alerts = await prisma.alert.findMany({
    where: { userEmail, status: "open" },
    select: { sku: true, systemQty: true, expectedMin: true }
  });

  const store = await prisma.store.findFirst({ where: { userEmail } });
  const priceMap = new Map();
  try {
    if (store?.shop && store?.accessToken) {
      const inv = await getInventoryByVariantGQL(store.shop, store.accessToken, { multiLocation: true });
      for (const row of inv) priceMap.set(row.sku || String(row.variantId), Number(row.price) || 0);
    }
  } catch {}

  const count = alerts.length;
  let atRiskRevenue = 0, confidenceHits = 0, confidenceTotal = 0;

  for (const a of alerts) {
    const price = priceMap.get(a.sku) ?? 0;
    const deficit = Math.max((a.expectedMin ?? 0) - (a.systemQty ?? 0), 0);
    atRiskRevenue += deficit * price;

    const checks = [Boolean(a.sku), price > 0, typeof a.systemQty === "number"];
    confidenceHits += checks.filter(Boolean).length;
    confidenceTotal += checks.length;
  }

  const confidence = confidenceTotal ? Math.round((confidenceHits / confidenceTotal) * 1000) / 10 : 100;
  return { count, atRiskRevenue: Math.round(atRiskRevenue * 100) / 100, confidence };
}
