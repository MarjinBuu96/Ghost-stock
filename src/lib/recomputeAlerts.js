import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";
import { prisma } from "@/lib/prisma";

// tiny helper: make a daily dedupe key
function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${a.sku}|${a.severity}|${day}`;
}

export async function recomputeForStore(store, userEmail) {
  const [inventory, salesMap] = await Promise.all([
    getInventoryByVariant(store.shop, store.accessToken),
    getSalesByVariant(store.shop, store.accessToken),
  ]);

  const alerts = computeAlerts(inventory, salesMap);

  // Upsert with dedupe key (storeId + uniqueHash)
  const ops = alerts.map((a) => {
    const uniqueHash = makeUniqueHash(a);
    return prisma.alert.upsert({
      where: {
        // Prisma will generate this compound unique input from @@unique([storeId, uniqueHash])
        storeId_uniqueHash: { storeId: store.id, uniqueHash },
      },
      update: {
        // keep most recent numbers/severity
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
      // very light filter (string starts-with) to limit to today’s hashes
      uniqueHash: { startsWith: `|` }, // placeholder; skip if you don't want closing
    },
    data: { status: "resolved" },
  });
  // Note: the above "startsWith" trick needs a consistent prefix to be useful.
  // You can skip closing stale in MVP.

  await prisma.$transaction(ops);
  return alerts.length;
}
