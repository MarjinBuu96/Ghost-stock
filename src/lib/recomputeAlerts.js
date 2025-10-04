import { getInventoryByVariantGQL, getSalesByVariantGQL } from "@/lib/shopifyGraphql";
import { computeAlerts } from "@/lib/alertsEngine";
import { prisma } from "@/lib/prisma";

// tiny helper: make a daily dedupe key
function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${a.sku}|${a.severity}|${day}`;
}

export async function recomputeForStore(store, userEmail) {
  const [inventory, salesMap] = await Promise.all([
    getInventoryByVariantGQL(store.shop, store.accessToken, { multiLocation: true }),
    getSalesByVariantGQL(store.shop, store.accessToken),
  ]);

  const alerts = computeAlerts(inventory, salesMap);

  const ops = alerts.map((a) => {
    const uniqueHash = makeUniqueHash(a);
    return prisma.alert.upsert({
      where: {
        storeId_uniqueHash: { storeId: store.id, uniqueHash },
      },
      update: {
        systemQty: a.systemQty,
        expectedMin: a.expectedMin,
        expectedMax: a.expectedMax,
        severity: a.severity,
        status: "open",
      },
      create: {
        userEmail,
        storeId: store.id,
        sku: a.sku,
        product: a.product,
        systemQty: a.systemQty,
        expectedMin: a.expectedMin,
        expectedMax: a.expectedMax,
        severity: a.severity,
        status: "open",
        uniqueHash,
      },
    });
  });

  // Optional: auto-close stale open alerts that no longer compute (same day)
  const day = new Date().toISOString().slice(0, 10);
  const keepSet = new Set(alerts.map((a) => makeUniqueHash(a)));
  const closeStale = prisma.alert.updateMany({
    where: {
      storeId: store.id,
      status: "open",
      uniqueHash: { startsWith: `|` }, // placeholder; skip if you don't want closing
    },
    data: { status: "resolved" },
  });

  await prisma.$transaction(ops);
  return alerts.length;
}
