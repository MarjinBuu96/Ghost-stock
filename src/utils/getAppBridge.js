// src/utils/getAppBridge.js
import createApp from "@shopify/app-bridge";

export function getAppBridge() {
  if (typeof window === "undefined") return null;
  const host = new URLSearchParams(window.location.search).get("host");
  if (!host) return null;

  if (!window.__SHOPIFY_APP__) {
    window.__SHOPIFY_APP__ = createApp({
      apiKey: "5860dca7a3c5d0818a384115d221179a",
      host,
      forceRedirect: true,
    });
  }
  return window.__SHOPIFY_APP__;
}
