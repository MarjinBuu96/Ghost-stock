
export function installShopifyRestGuard() {
  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url && /\/admin\/(api\/\d{4}-\d{2}\/)?(products|variants)(\.json|\/?)(\?|$)/i.test(url)) {
      throw new Error(
        "Blocked deprecated Shopify Admin REST call to /products or /variants. Use Admin GraphQL instead."
      );
    }
    return realFetch(input, init);
  };
}
