// src/lib/fetcher.js
import { decodeShopFromHost, topLevelRedirect } from "@/lib/embedded";

export async function fetcher(u) {
  const r = await fetch(u, { credentials: "include" }); // send cookies
  if (r.status === 401) {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get("shop") || decodeShopFromHost() || "";
    const to = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
    topLevelRedirect(to); // start top-level OAuth
    throw new Error("unauthorized");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}
