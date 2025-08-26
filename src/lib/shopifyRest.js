// src/lib/shopifyRest.js

// --- retry wrapper for 429 / 5xx ---
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchWithRetry(url, opts={}, tries=5) {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const is429 = res.status === 429;
    const is5xx = res.status >= 500 && res.status < 600;
    attempt++;
    if ((is429 || is5xx) && attempt < tries) {
      await sleep(retryAfter ? retryAfter * 1000 : attempt * 500);
      continue;
    }
    return res; // bubble up to caller to handle
  }
}



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


export async function getInventorySnapshot(shop, accessToken, { multiLocation = false } = {}) {
  // 1) Pull variants (title, variant ids, sku, price, inventory_item_id, fallback qty)
  const rows = [];
  let endpoint = `https://${shop}/admin/api/2024-07/products.json?limit=250&fields=id,title,variants`;
  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  while (endpoint) {
    const r = await fetch(endpoint, { headers });
    if (!r.ok) throw new Error(`Products fetch failed ${r.status}`);
    const json = await r.json();
    for (const p of json.products || []) {
      for (const v of p.variants || []) {
        rows.push({
          product: p.title,
          variantId: v.id,
          inventory_item_id: v.inventory_item_id,
          sku: v.sku || "",
          price: typeof v.price === "string" ? Number(v.price) : (v.price ?? 0),
          // Fallback system qty (Starter behavior)
          systemQty: typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0,
        });
      }
    }

    // cursor pagination (page_info) from Link header
    const link = r.headers.get("link") || r.headers.get("Link");
    if (link && link.includes('rel="next"')) {
      const m = link.match(/<([^>]+)>;\s*rel="next"/i);
      endpoint = m ? m[1] : null;
    } else {
      endpoint = null;
    }
  }

  if (!multiLocation || rows.length === 0) {
    return rows;
  }

  // 2) If multiLocation: sum inventory_levels across ALL locations per inventory_item_id
  const byItem = new Map(); // inventory_item_id -> total available
  const itemIds = rows.map(r => r.inventory_item_id).filter(Boolean);
  const chunk = (arr, size) => arr.reduce((a, _, i) => (i % size ? a : [...a, arr.slice(i, i + size)]), []);

  try {
    // Shopify REST inventory_levels supports up to 50 inventory_item_ids at a time
    for (const ids of chunk(itemIds, 50)) {
      const url =
        `https://${shop}/admin/api/2024-07/inventory_levels.json?` +
        `inventory_item_ids=${ids.join(",")}&limit=250`;
      let next = url;

      while (next) {
        const res = await fetch(next, { headers });
        if (!res.ok) throw new Error(`inventory_levels fetch failed ${res.status}`);
        const data = await res.json();
        for (const lvl of data.inventory_levels || []) {
          const id = lvl.inventory_item_id;
          const available = typeof lvl.available === "number" ? lvl.available : 0;
          byItem.set(id, (byItem.get(id) || 0) + available);
        }

        const l2 = res.headers.get("link") || res.headers.get("Link");
        if (l2 && l2.includes('rel="next"')) {
          const m2 = l2.match(/<([^>]+)>;\s*rel="next"/i);
          next = m2 ? m2[1] : null;
        } else {
          next = null;
        }
      }
    }

    // apply totals to rows
    for (const r of rows) {
      const sum = byItem.get(r.inventory_item_id);
      if (typeof sum === "number") r.systemQty = sum;
    }
  } catch (e) {
    // If we fail (missing scope, etc.), just fall back silently to variant.inventory_quantity
    console.warn("Multi-location inventory_levels failed, falling back:", e?.message || e);
  }

  return rows;
}

// === Adapter used by /api/shopify/scan for Pro/Enterprise
export async function getInventoryByVariantMultiLocation(shop, accessToken) {
  // Reuse the snapshot function with multiLocation=true
  return getInventorySnapshot(shop, accessToken, { multiLocation: true });
}
