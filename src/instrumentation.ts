export async function register() {
  // Only install on the Node.js runtime (skip Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installShopifyRestGuard } = await import("./lib/guardShopifyRest");
    installShopifyRestGuard();
  }
}
