
export function installShopifyRestGuard() {
  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";

    const isDeprecatedCall = url && /\/admin\/(api\/\d{4}-\d{2}\/)?(products|variants)(\.json|\/?)(\?|$)/i.test(url);

    if (isDeprecatedCall) {
      console.warn("🚫 Blocked deprecated Shopify Admin REST call:", url);
      console.trace("🔍 Stack trace for deprecated REST usage:");
      throw new Error(
        "Blocked deprecated Shopify Admin REST call to /products or /variants. Use Admin GraphQL instead."
      );
    }

    return realFetch(input, init);
  };
}
