// src/lib/shopifyGraphql.js
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07";

async function gql(shop, accessToken, query, variables = {}) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
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
 * Fetch all variants via GraphQL and return an array:
 * [{ variantId, sku, product, systemQty, inventory_item_id, levels?[] }]
 *
 * - When multiLocation=false: uses variant.inventoryQuantity.
 * - When multiLocation=true: sums InventoryLevel.available across locations.
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
            product { title }
            inventoryQuantity
            inventoryItem {
              id
              ${multiLocation ? `
              inventoryLevels(first: 50) {
                nodes {
                  available
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

    for (const { node } of edges) {
      const v = node;
      const levels = multiLocation
        ? (v.inventoryItem?.inventoryLevels?.nodes || []).map((l) => ({
            locationId: l.location?.id || null,
            locationName: l.location?.name || "",
            available: Number(l.available ?? 0),
          }))
        : null;

      const systemQty = multiLocation
        ? (levels || []).reduce((sum, l) => sum + (l.available || 0), 0)
        : (typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : 0);

      items.push({
        variantId: v.id,
        sku: v.sku || "",
        product: v.product?.title || v.title || "",
        systemQty,
        inventory_item_id: v.inventoryItem?.id || null,
        ...(multiLocation ? { levels } : {}),
      });
    }

    hasNext = !!conn?.pageInfo?.hasNextPage;
    cursor = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return items;
}
