export async function getInventoryByVariantGQL(
  shop,
  accessToken,
  { multiLocation = false, pageSize = 100, levelPageSize = 250 } = {}
) {
  const query = `
    query Variants($first: Int!, $after: String, $levelFirst: Int!) {
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
              inventoryLevels(first: $levelFirst) {
                nodes {
                  location { id name }
                  quantities(names: ["available"]) { name quantity }
                }
              }` : ``}
            }
          }
        }
      }
    }
  `;

  const items = [];
  let after = null, hasNext = true;

  while (hasNext) {
    const data = await gql(shop, accessToken, query, {
      first: pageSize,
      after,
      levelFirst: levelPageSize,
    });

    const conn = data?.productVariants;
    const edges = conn?.edges || [];

    for (const { node: v } of edges) {
      const levels = multiLocation
        ? (v.inventoryItem?.inventoryLevels?.nodes || []).map(n => ({
            locationId: n.location?.id || null,
            locationName: n.location?.name || "",
            available: Number((n.quantities || []).find(q => q?.name === "available")?.quantity ?? 0),
          }))
        : null;

      const systemQty = multiLocation
        ? (levels || []).reduce((sum, l) => sum + (l.available || 0), 0)
        : (Number.isFinite(v.inventoryQuantity) ? v.inventoryQuantity : 0);

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
    after = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return items;
}
