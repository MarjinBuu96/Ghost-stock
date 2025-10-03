// src/lib/shopifyGraphql.js
import { shopifyGraphqlUrl } from "@/lib/shopifyApi";

/** Minimal GraphQL POST helper */
async function gql(shop, accessToken, query, variables = {}) {
  const resp = await fetch(shopifyGraphqlUrl(shop), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.errors) {
    const err = (json.errors && JSON.stringify(json.errors)) || JSON.stringify(json);
    throw new Error(`Shopify GraphQL ${resp.status}: ${err}`);
  }
  return json.data;
}

/**
 * Fetch all variants via GraphQL.
 * Returns: [{ variantId, sku, product, systemQty, price, inventory_item_id, levels?[] }]
 * - When multiLocation=false: uses variant.inventoryQuantity.
 * - When multiLocation=true: sums InventoryLevel.availableQuantity across locations.
 */
export async function getInventoryByVariantGQL(
  shop,
  accessToken,
  { multiLocation = false, pageSize = 100 } = {}
) {
  const query = `
    query Variants($pageSize: Int!, $cursor: String) {
      productVariants(first: $pageSize, after: $cursor) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            sku
            title
            price
            product { title }
            inventoryQuantity
            inventoryItem {
              id
              ${multiLocation ? `
              inventoryLevels(first: 50) {
                nodes {
                  availableQuantity
                  location { id name }
                }
              }` : ``}
            }
          }
        }
      }
    }
  `;

  const items = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const data = await gql(shop, accessToken, query, { pageSize, cursor });
    const conn = data?.productVariants;
    const edges = conn?.edges || [];

    for (const { node: v } of edges) {
      // Build per-location levels (if requested)
      const levels = multiLocation
        ? (v.inventoryItem?.inventoryLevels?.nodes || []).map((l) => ({
            locationId: l.location?.id || null,
            locationName: l.location?.name || "",
            // normalize to .available for the rest of the app
            available: Number(l?.availableQuantity ?? 0),
          }))
        : null;

      // If multi-location requested but nothing came back (e.g. scope/locations),
      // fall back to variant.inventoryQuantity so snapshot still shows numbers.
      const systemQty = multiLocation
        ? ((levels || []).length
            ? (levels || []).reduce((sum, l) => sum + (l.available || 0), 0)
            : Number(v.inventoryQuantity ?? 0))
        : Number(v.inventoryQuantity ?? 0);

      items.push({
        variantId: v.id,
        sku: v.sku || "",
        product: v.product?.title || v.title || "",
        systemQty,
        price: Number(v.price ?? 0),
        inventory_item_id: v.inventoryItem?.id || null,
        ...(multiLocation ? { levels } : {}),
      });
    }

    hasNext = !!conn?.pageInfo?.hasNextPage;
    cursor = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return items;
}
