// src/lib/alertsEngine.js

function getSold(sales, key) {
  if (!sales) return 0;
  if (sales instanceof Map) return sales.get(key) || 0;
  // plain object
  return sales[key] || 0;
}

/**
 * inventory: [{ sku, product, variantId, inventory_item_id, systemQty }, ...]
 * sales: Map or plain object keyed by SKU or variantId string → units sold in period
 */
export function computeAlerts(inventory, sales) {
  const alerts = [];
  for (const row of inventory || []) {
    const key =
      row.sku ||
      (row.variantId != null ? String(row.variantId) : null) ||
      (row.inventory_item_id != null ? String(row.inventory_item_id) : null);

    const sold = key ? getSold(sales, key) : 0;

    // simple expected range from recent sales (tweak later)
    const expectedMin = sold > 10 ? 5 : sold > 3 ? 2 : sold > 0 ? 1 : 0;
    const expectedMax = expectedMin + 2;

    let severity = null;
    if (row.systemQty === 0 && sold > 0) severity = "high";
    else if (row.systemQty < expectedMin && expectedMin > 0) severity = sold > 5 ? "high" : "med";

    if (severity) {
      alerts.push({
        sku: row.sku || key || "UNKNOWN",
        product: row.product,
        systemQty: typeof row.systemQty === "number" ? row.systemQty : 0,
        expectedMin,
        expectedMax,
        severity,
      });
    }
  }
  return alerts;
}
