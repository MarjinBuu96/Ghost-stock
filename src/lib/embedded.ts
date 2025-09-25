// src/lib/embedded.ts
export function decodeShopFromHost(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");
    if (!host) return null;
    const decoded = atob(host); // e.g. mystore.myshopify.com/admin
    return decoded.split("/")[0] || null;
  } catch {
    return null;
  }
}

export function topLevelRedirect(target: string) {
  const url = `/shopify/exit-iframe?target=${encodeURIComponent(target)}`;
  if (typeof window === "undefined") return;
  // Always go through exit-iframe so we escape the Shopify iframe safely
  window.location.href = url;
}
