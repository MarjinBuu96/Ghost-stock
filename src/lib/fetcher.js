// Embedded-aware fetcher: kicks off OAuth at top-level on 401
import { decodeShopFromHost, topLevelRedirect } from "@/lib/embedded";

export const fetcher = async (u) => {
  const r = await fetch(u, { credentials: "include" });
  if (r.status === 401) {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get("shop") || decodeShopFromHost() || "";
    const to = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
    topLevelRedirect(to);
    throw new Error("unauthorized");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};
