import crypto from "crypto";

/**
 * Verifies Shopify OAuth HMAC using query params and shared secret.
 * @param {Object} query - Parsed query object (not URLSearchParams)
 * @param {string} hmac - HMAC from Shopify
 * @param {string} secret - Your Shopify API secret
 * @returns {boolean}
 */
export function verifyOAuthQueryHmac(query, hmac, secret) {
  const sortedParams = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`)
    .join("&");

  const generated = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  const match = generated === hmac;
  if (!match) {
    console.warn("🔐 HMAC mismatch", { sortedParams, generated, provided: hmac });
  }
  return match;
}
