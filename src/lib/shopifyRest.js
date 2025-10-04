// src/lib/shopifyRest.js

// Centralize API version in one place
const API_VERSION = "2025-07";

// ---------- tiny retry helper ----------
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
    return res; // let caller decide
  }
}

// ---------- utils ----------
function normalizePathOrUrl(shop, pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const u = new URL(pathOrUrl);
    return u.toString();
  }
  return `https://${shop}/admin/api/${API_VERSION}/${pathOrUrl.replace(/^\/+/, "")}`;
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
  const m = link.match(/<([^>]+)>\s*;\s*rel="next"/i);
  if (!m) return null;
  try {
    return new URL(m[1]).toString();
  } catch {
    return null;
  }
}

function toNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

// ---------- low-level GET ----------
export async function shopifyGetRaw(shop, token, pathOrUrl, search = {}) {
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

// ---------- inventory (GraphQL) ----------
import { shopifyGraphql } from "@/lib/shopifyGraphql";

export async function getInventoryByVariant(shop, token) {
  const query = `
    query Variants($first: Int!, $after: String) {
      productVariants(first: $first, after: $after) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            sku
            price
            inventoryQuantity
            product { title }
            inventoryItem { id }
          }
        }
      }
    }
  `;

  const rows = [];
  let after = null, hasNext = true;

  while (hasNext) {
    const data = await shopifyGraphql(shop, token, query, { first: 100, after });
    const conn = data?.productVariants;
    const edges = conn?.edges || [];

    for (const { node: v } of edges) {
      rows.push({
        sku: v.sku || "",
        product: v.product?.title || "",
        variantId: v.id,
        inventory_item_id: v.inventoryItem?.id || null,
        systemQty: Number.isFinite(v.inventoryQuantity) ? v.inventoryQuantity : 0,
        price: Number(v.price) || 0,
      });
    }

    hasNext = !!conn?.pageInfo?.hasNextPage;
    after = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return rows;
}

// ---------- DEPRECATED REST EXPORTS — BLOCKED ----------
export async function getSalesByVariant() {
  throw new Error("🚫 Deprecated REST call blocked: use getSalesByVariantGQL instead");
}

export async function getInventorySnapshot() {
  throw new Error("🚫 Deprecated REST call blocked: use getInventoryByVariantGQL instead");
}

export async function getInventoryByVariantMultiLocation() {
  throw new Error("🚫 Deprecated REST call blocked: use getInventoryByVariantGQL with multiLocation=true");
}
