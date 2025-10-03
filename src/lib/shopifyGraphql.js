// src/lib/shopifyGraphql.js
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

function shopifyGraphqlUrl(shop) {
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

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
                  location { id name }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
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
      let levels = null;
      if (multiLocation) {
        const raw = v.inventoryItem?.inventoryLevels?.nodes || [];
        levels = raw.map((n) => {
          const avail = Array.isArray(n.quantities)
            ? Number(n.quantities.find((q) => q?.name === "available")?.quantity ?? 0)
            : 0;
          return {
            locationId: n.location?.id || null,
            locationName: n.location?.name || "",
            available: avail,
          };
        });
      }

      const systemQty = multiLocation
        ? (levels || []).reduce((sum, l) => sum + (l.available || 0), 0)
        : Number(v.inventoryQuantity ?? 0);

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
