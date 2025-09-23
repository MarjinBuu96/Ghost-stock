// src/lib/shopifyRest.js

// ---------- tiny retry helper ----------
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, tries = 5) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, opts);
    if (res.ok) return res;

    const is429 = res.status === 429;
    const is5xx = res.status >= 500 && res.status < 600;
    const retryAfter = Number(res.headers.get("retry-after")) || 0;

    attempt++;
    if ((is429 || is5xx) && attempt < tries) {
      await sleep(retryAfter ? retryAfter * 1000 : attempt * 500);
      continue;
    }
    return res; // let caller surface the error details
  }
}

// ---------- utils ----------
function buildUrl(shop, path, search = {}) {
  const url = new URL(`https://${shop}/admin/api/2024-07/${path}`);
  Object.entries(search).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return url.toString();
}

function nextLinkFromHeaders(headers) {
  const link = headers.get("link") || headers.get("Link") || "";
  if (!link || !link.includes('rel="next"')) return null;
  const m = link.match(/<([^>]+)>;\s*rel="next"/i);
  return m ? m[1] : null; // full next URL
}

function toNumber(n, fallback = 0) {
  if (n == null || n === "") return fallback;
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

// ---------- low-level GET ----------
export async function shopifyGetRaw(shop, token, path, search = {}) {
  const url = buildUrl(shop, path, search);
  const res = await fetchWithRetry(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text().catch(() => "");
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body, headers: res.headers, text, url };
}

// ---------- inventory (single-location fallback from variant.inventory_quantity) ----------
export async function getInventoryByVariant(shop, token) {
  const rows = [];
  let pageUrl = buildUrl(shop, "products.json", { limit: "250" });

  while (pageUrl) {
    const { ok, status, body, headers, text, url } = await shopifyGetRaw(
      shop, token, pageUrl.replace(/^https:\/\/[^/]+\/admin\/api\/2024-07\//, ""), {}
    );

    if (!ok) {
      throw new Error(`GET ${url} -> HTTP ${status} ${typeof body === "string" ? body : text}`);
    }

    const products = body?.products ?? [];
    for (const p of products) {
      for (const v of (p.variants ?? [])) {
        rows.push({
          sku: v.sku || `${p.id}-${v.id}`,
          product: p.title,
          variantId: v.id,
          inventory_item_id: v.inventory_item_id,
          systemQty: typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0,
          price: toNumber(v.price, 0),
        });
      }
    }

    pageUrl = nextLinkFromHeaders(headers);
  }

  return rows;
}

// ---------- orders → sales velocity (paginated) ----------
/**
 * Returns a map { skuOrVariantKey: quantitySold } for the last `daysBack` days.
 * Requires `read_orders` scope. Caller should catch 401/403 and treat as optional.
 */
export async function getSalesByVariant(shop, token, daysBack = 14) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const sales = new Map();

  let pageUrl = buildUrl(shop, "orders.json", {
    status: "any",
    limit: "250",
    created_at_min: since,
    fields: "id,line_items,created_at",
  });

  while (pageUrl) {
    const res = await fetchWithRetry(pageUrl, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`GET ${pageUrl} -> HTTP ${res.status} ${text}`);
    }

    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}

    const orders = body?.orders ?? [];
    for (const o of orders) {
      for (const li of (o.line_items ?? [])) {
        const key =
          li.sku ||
          (li.variant_id != null ? String(li.variant_id) :
            (li.product_id != null ? String(li.product_id) : null));
        if (!key) continue;
        sales.set(key, (sales.get(key) || 0) + (li.quantity || 0));
      }
    }

    pageUrl = nextLinkFromHeaders(res.headers);
  }

  return Object.fromEntries(sales);
}

// ---------- inventory snapshot (+ optional multi-location via inventory_levels) ----------
export async function getInventorySnapshot(shop, accessToken, { multiLocation = false } = {}) {
  const rows = [];
  let pageUrl = buildUrl(shop, "products.json", {
    limit: "250",
    fields: "id,title,variants",
  });

  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  while (pageUrl) {
    const r = await fetchWithRetry(pageUrl, { headers });
    if (!r.ok) throw new Error(`Products fetch failed ${r.status}`);
    const json = await r.json();

    for (const p of json.products || []) {
      for (const v of p.variants || []) {
        rows.push({
          product: p.title,
          variantId: v.id,
          inventory_item_id: v.inventory_item_id,
          sku: v.sku || "",
          price: toNumber(v.price, 0),
          systemQty: typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0, // fallback
        });
      }
    }

    pageUrl = nextLinkFromHeaders(r.headers);
  }

  if (!multiLocation || rows.length === 0) {
    return rows;
  }

  // Sum inventory_levels across ALL locations per inventory_item_id
  const byItem = new Map(); // inventory_item_id -> total available
  const itemIds = rows.map(r => r.inventory_item_id).filter(Boolean);

  const chunk = (arr, size) =>
    arr.reduce((a, _, i) => (i % size ? a : [...a, arr.slice(i, i + size)]), []);

  try {
    for (const ids of chunk(itemIds, 50)) {
      let next = buildUrl(shop, "inventory_levels.json", {
        inventory_item_ids: ids.join(","),
        limit: "250",
      });

      while (next) {
        const res = await fetchWithRetry(next, { headers });
        if (!res.ok) throw new Error(`inventory_levels fetch failed ${res.status}`);
        const data = await res.json();

        for (const lvl of data.inventory_levels || []) {
          const id = lvl.inventory_item_id;
          const available = typeof lvl.available === "number" ? lvl.available : 0;
          byItem.set(id, (byItem.get(id) || 0) + available);
        }

        next = nextLinkFromHeaders(res.headers);
      }
    }

    // apply totals to rows
    for (const r of rows) {
      const sum = byItem.get(r.inventory_item_id);
      if (typeof sum === "number") r.systemQty = sum;
    }
  } catch (e) {
    console.warn("Multi-location inventory_levels failed, falling back:", e?.message || e);
    // silently fall back to variant.inventory_quantity
  }

  return rows;
}

// Convenience adapter used by /api/shopify/scan for Pro/Enterprise
export async function getInventoryByVariantMultiLocation(shop, accessToken) {
  return getInventorySnapshot(shop, accessToken, { multiLocation: true });
}


