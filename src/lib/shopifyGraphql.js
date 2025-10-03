// src/lib/shopifyGraphql.js

// Keep a single source of truth for Admin API version
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

export function gidToId(gid) {
  // "gid://shopify/InventoryItem/123456789" -> "123456789"
  if (!gid || typeof gid !== "string") return null;
  const parts = gid.split("/");
  return parts.length ? parts[parts.length - 1] : null;
}

export async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const resp = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.errors) {
    const err = (json.errors && JSON.stringify(json.errors)) || JSON.stringify(json);
    throw new Error(`Shopify GraphQL ${resp.status}: ${err}`);
  }
  return json.data;
}

/**
 * Fetch variants via GraphQL and return:
 * [{ variantId, sku, product, systemQty, inventory_item_id (numeric string), inventoryItemIdGid }]
 *
 * - When multiLocation=false: uses node.inventoryQuantity.
 * - When multiLocation=true: sums inventoryLevels.available across locations.
 */
export async function getInventoryByVariantGQL(
  shop,
  accessToken,
  { multiLocation = false, pageSize = 100, maxVariants = 10000 } = {}
) {
  const QUERY = `
    query Variants($first: Int!, $after: String) {
      productVariants(first: $first, after: $after) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            sku
            title
            product { title }
            inventoryQuantity
            inventoryItem {
              id
              ${multiLocation ? `
              inventoryLevels(first: 50) {
                nodes {
                  available
                }
              }` : ``}
            }
          }
        }
      }
    }
  `;

  const out = [];
  let after = null;
  let hasNext = true;

  while (hasNext) {
    const data = await shopifyGraphQL(shop, accessToken, QUERY, { first: pageSize, after });
    const conn = data?.productVariants;
    const edges = conn?.edges || [];

    for (const { node: v } of edges) {
      const levels = multiLocation
        ? (v.inventoryItem?.inventoryLevels?.nodes || [])
        : null;

      const systemQty = multiLocation
        ? (levels || []).reduce((sum, l) => sum + (Number(l?.available ?? 0) || 0), 0)
        : (typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : 0);

      const inventoryItemIdGid = v?.inventoryItem?.id || null;

      out.push({
        variantId: v.id,                                    // gid
        sku: v.sku || "",
        product: v.product?.title || v.title || "",
        systemQty,
        inventory_item_id: gidToId(inventoryItemIdGid),     // numeric as string for compatibility
        inventoryItemIdGid,                                  // original gid if you need it
      });

      if (out.length >= maxVariants) break;
    }

    if (out.length >= maxVariants) break;
    hasNext = !!conn?.pageInfo?.hasNextPage;
    after = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return out;
}
