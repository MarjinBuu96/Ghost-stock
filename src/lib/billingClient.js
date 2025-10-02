// src/lib/billingClient.js
export function getEmbeddedHost() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const h =
    params.get("host") ||
    document.cookie.match(/(?:^|;\\s*)shopifyHost=([^;]+)/)?.[1] ||
    null;
  if (h) {
    document.cookie = `shopifyHost=${h}; path=/; SameSite=None; Secure`;
  }
  return h;
}

export async function startUpgrade(plan, host) {
  const allowed = ["starter", "starter_annual", "pro", "pro_annual"];
  const safePlan = allowed.includes(plan) ? plan : "pro";
  const res = await fetch(`/api/shopify/billing/upgrade?host=${host || ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: safePlan }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.confirmationUrl) {
    throw new Error(json?.error || "Upgrade failed");
  }
  window.open(json.confirmationUrl, "_blank", "noopener,noreferrer");
}
