// src/lib/shopifyGraphql.js
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

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

// Helper: turn numeric REST ids into GraphQL GIDs
const gid = (type, id) => (String(id).startsWith("gid://") ? String(id) : `gid://shopify/${type}/${id}`);

/** ===== INVENTORY (your existing function, unchanged except API ver) ===== */
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
                  quantities { availableQuantity }
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
  let cursor = null, hasNext = true;
  while (hasNext) {
    const data = await gql(shop, accessToken, query, { pageSize, cursor });
    const conn = data?.productVariants;
    const edges = conn?.edges || [];
    for (const { node: v } of edges) {
      const levels = multiLocation
        ? (v.inventoryItem?.inventoryLevels?.nodes || []).map(l => ({
            locationId: l.location?.id || null,
            locationName: l.location?.name || "",
            available: Number(l.quantities?.availableQuantity ?? 0),
          }))
        : null;
      const systemQty = multiLocation
        ? (levels || []).reduce((s, l) => s + (l.available || 0), 0)
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


/** ===== PRODUCTS ===== */

// GET /products/<id>.json
export async function getProduct(shop, accessToken, productId, variantFirst = 50) {
  const query = `
    query Product($id: ID!, $first: Int!) {
      product(id: $id) {
        id title handle status createdAt updatedAt vendor tags
        variants(first: $first) { edges { node { id title sku price inventoryQuantity position } } }
      }
    }
  `;
  return gql(shop, accessToken, query, { id: gid("Product", productId), first: variantFirst });
}

// POST /products.json
export async function createProduct(shop, accessToken, input /* ProductInput */) {
  const mutation = `
    mutation Create($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle title }
        userErrors { field message }
      }
    }
  `;
  return gql(shop, accessToken, mutation, { input });
}

// PUT /products/<id>.json
export async function updateProduct(shop, accessToken, productId, input /* ProductInput */) {
  const mutation = `
    mutation Update($id: ID!, $input: ProductInput!) {
      productUpdate(id: $id, input: $input) {
        product { id title updatedAt }
        userErrors { field message }
      }
    }
  `;
  return gql(shop, accessToken, mutation, { id: gid("Product", productId), input });
}

// DELETE /products/<id>.json
export async function deleteProduct(shop, accessToken, productId) {
  const mutation = `
    mutation Delete($id: ID!) {
      productDelete(id: $id) { deletedProductId userErrors { field message } }
    }
  `;
  return gql(shop, accessToken, mutation, { id: gid("Product", productId) });
}

/** ===== VARIANTS ===== */

// POST /products/<product_id>/variants.json
export async function createVariant(shop, accessToken, productId, input /* ProductVariantInput */) {
  const mutation = `
    mutation CreateVariant($productId: ID!, $input: ProductVariantInput!) {
      productVariantCreate(productId: $productId, input: $input) {
        productVariant { id sku title price inventoryQuantity }
        userErrors { field message }
      }
    }
  `;
  return gql(shop, accessToken, mutation, { productId: gid("Product", productId), input });
}

// PUT /variants/<variant_id>.json
export async function updateVariant(shop, accessToken, variantId, input /* ProductVariantInput */) {
  const mutation = `
    mutation UpdateVariant($id: ID!, $input: ProductVariantInput!) {
      productVariantUpdate(id: $id, input: $input) {
        productVariant { id sku title price inventoryQuantity }
        userErrors { field message }
      }
    }
  `;
  return gql(shop, accessToken, mutation, { id: gid("ProductVariant", variantId), input });
}

// DELETE /variants/<variant_id>.json
export async function deleteVariant(shop, accessToken, variantId) {
  const mutation = `
    mutation DeleteVariant($id: ID!) {
      productVariantDelete(id: $id) {
        deletedProductVariantId
        userErrors { field message }
      }
    }
  `;
  return gql(shop, accessToken, mutation, { id: gid("ProductVariant", variantId) });
}

export { gql as shopifyGraphql };

