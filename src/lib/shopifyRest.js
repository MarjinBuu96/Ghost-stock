// src/lib/shopifyRest.js

function buildUrl(shop, path, search = {}) {
  const url = new URL(`https://${shop}/admin/api/2024-07/${path}`);
  // only include defined, non-empty params
  Object.entries(search).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  });
  return url.toString();
}

export async function shopifyGetRaw(shop, token, path, search = {}) {
  const url = buildUrl(shop, path, search);
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text().catch(() => "");
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body, headers: res.headers, text };
}

export async function getInventoryByVariant(shop, token) {
  const rows = [];
  let pageInfo = undefined;

  while (true) {
    // NOTE: do NOT restrict fields; we need variant.price and inventory_quantity
    const search = {
      limit: "250",
      ...(pageInfo ? { page_info: pageInfo } : {}),
    };

    const { ok, status, body, headers, text } = await shopifyGetRaw(shop, token, "products.json", search);
    if (!ok) throw new Error(`products.json -> HTTP ${status} ${typeof body === "string" ? body : text}`);

    const products = body?.products ?? [];
    for (const p of products) {
      for (const v of (p.variants ?? [])) {
        rows.push({
          sku: v.sku || `${p.id}-${v.id}`,
          product: p.title,
          variantId: v.id,
          inventory_item_id: v.inventory_item_id,
          systemQty: typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0,
          price: v.price != null ? Number(v.price) : 0,   // <-- add price here
        });
      }
    }

    const link = headers.get("link") || headers.get("Link") || "";
    const hasNext = link.includes('rel="next"');
    if (!hasNext) break;

    const match = link.match(/<[^>]*\?(?:[^>]*&)?page_info=([^&>]+)[^>]*>;\s*rel="next"/i);
    pageInfo = match ? decodeURIComponent(match[1]) : undefined;
    if (!pageInfo) break;
  }

  return rows;
}


/**
 * Optional velocity (needs read_orders). If missing scope, your /scan route will catch 401/403 and proceed with {}.
 */
export async function getSalesByVariant(shop, token) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { ok, status, body, text } = await shopifyGetRaw(shop, token, "orders.json", {
    status: "any",
    limit: "100",
    created_at_min: since,
    fields: "id,line_items,created_at",
  });
  if (!ok) throw new Error(`orders.json -> HTTP ${status} ${typeof body === "string" ? body : text}`);

  const orders = body?.orders ?? [];
  const sales = new Map();
  for (const o of orders) {
    for (const li of (o.line_items ?? [])) {
      const key = li.sku || (li.variant_id != null ? String(li.variant_id) : (li.product_id != null ? String(li.product_id) : null));
      if (!key) continue;
      sales.set(key, (sales.get(key) || 0) + (li.quantity || 0));
    }
  }
  return Object.fromEntries(sales);
}
