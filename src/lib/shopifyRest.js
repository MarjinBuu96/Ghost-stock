// src/lib/shopifyRest.js
import { shopifyRestUrl } from "@/lib/shopifyApi";
import { getInventoryByVariantGQL } from "@/lib/shopifyGraphql";

/* ------------------------------ helpers ------------------------------ */

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    return res;
  }
}

function normalizePathOrUrl(shop, pathOrUrl) {
  const s = String(pathOrUrl || "");
  // Full URL (e.g., Link header "next") → keep as-is.
  if (/^https?:\/\//i.test(s)) return s;
  // Otherwise build via our central helper (keeps API version consistent).
  return shopifyRestUrl(shop, s.replace(/^\/+/, ""));
}

function buildUrl(shop, path, search = {}) {
  const url = new URL(normalizePathOrUrl(shop, path));
  Object.entries(search).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  return url.toString();
}

function nextLinkFromHeaders(headers) {
  const link = headers.get("link") || headers.get("Link") || "";
  if (!link) return null;
  const m = link.match(/<([^>]+)>\s*;\s*rel="next"/i);
  if (!m) return null;
  try {
    return new URL(m[1]).toString();
  } catch {
    return null;
  }
}

/* ----------------------------- low-level GET ----------------------------- */

export async function shopifyGetRaw(shop, token, pathOrUrl, search = {}) {
  // 🚫 Belt-and-braces: block deprecated product/variant REST endpoints
  const asString = String(pathOrUrl || "");
  if (/(^|\/)(products|variants)\.json(?:$|[?#])/i.test(asString)) {
    throw new Error("Blocked deprecated Shopify REST endpoint: " + asString);
  }

  const url = buildUrl(shop, pathOrUrl, search);
  const res = await fetchWithRetry(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text().catch(() => "");
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}

  return { ok: res.ok, status: res.status, body, headers: res.headers, text, url };
}

/* -------------------- INVENTORY (GraphQL-backed) -------------------- */

/**
 * Snapshot used by callers expecting a REST-like shape.
 * Returns [{ sku, product, variantId, inventory_item_id, systemQty, price, (levels?) }]
 */
export async function getInventorySnapshot(
  shop,
  accessToken,
  { multiLocation = false } = {}
) {
  const items = await getInventoryByVariantGQL(shop, accessToken, { multiLocation });
  return (items || []).map((it) => ({
    sku: it.sku || "",
    product: it.product || it.title || "",
    variantId: it.variantId ?? it.id ?? null,
    inventory_item_id:
      it.inventory_item_id ??
      (typeof it.inventoryItemId !== "undefined" ? it.inventoryItemId : null),
    systemQty: Number(it.systemQty ?? 0),
    price: Number(it.price ?? 0), // ✅ needed for At-Risk revenue
    ...(multiLocation && Array.isArray(it.levels) ? { levels: it.levels } : {}),
  }));
}

// Friendly aliases kept for existing imports elsewhere
export async function getInventoryByVariant(shop, accessToken) {
  return getInventorySnapshot(shop, accessToken, { multiLocation: false });
}
export async function getInventoryByVariantMultiLocation(shop, accessToken) {
  return getInventorySnapshot(shop, accessToken, { multiLocation: true });
}

/* --------------- ORDERS → sales velocity (REST; OK) --------------- */

/**
 * Returns a map { skuOrVariantKey: quantitySold } for the last `daysBack` days.
 * Requires `read_orders` scope. Caller may treat 401/403 as "optional".
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
      throw new Error(`GET ${pageUrl} -> HTTP ${res.status}${text ? ` ${text}` : ""}`);
    }

    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {}

    const orders = Array.isArray(body?.orders) ? body.orders : [];
    for (const o of orders) {
      const items = Array.isArray(o?.line_items) ? o.line_items : [];
      for (const li of items) {
        const key =
          li?.sku ||
          (li?.variant_id != null
            ? String(li.variant_id)
            : li?.product_id != null
            ? String(li.product_id)
            : null);
        if (!key) continue;
        sales.set(key, (sales.get(key) || 0) + (li?.quantity || 0));
      }
    }

    pageUrl = nextLinkFromHeaders(res.headers);
  }

  return Object.fromEntries(sales);
}
