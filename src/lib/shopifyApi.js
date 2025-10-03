// Centralized Shopify Admin API version + helpers
export const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION || "2025-07";

export const shopifyRestUrl = (shop, path) =>
  `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${String(path).replace(/^\/+/, "")}`;

export const shopifyGraphqlUrl = (shop) =>
  `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
