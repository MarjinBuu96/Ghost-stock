// lib/shopifyHmac.js
import crypto from "crypto";

/**
 * Verifies Shopify OAuth HMAC using the RAW query string.
 * Includes all params except hmac/signature. Sort by key. No decoding/re-encoding.
 */
export function verifyShopifyHmacFromRawQS(rawQueryString, providedHmac, appSecret) {
  if (!rawQueryString || !providedHmac || !appSecret) return false;

  const stripped = rawQueryString
    .replace(/(^|&)hmac=[^&]*/i, "$1")
    .replace(/(^|&)signature=[^&]*/i, "$1")
    .replace(/^&+|&+$/g, "");

  const pairs = stripped
    .split("&")
    .filter(Boolean)
    .map(kv => {
      const i = kv.indexOf("=");
      return i === -1 ? [kv, ""] : [kv.slice(0, i), kv.slice(i + 1)];
    });

  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = pairs.map(([k, v]) => `${k}=${v}`).join("&");

  const computed = crypto.createHmac("sha256", appSecret).update(message, "utf8").digest("hex");
  const A = Buffer.from(computed, "utf8");
  const B = Buffer.from(String(providedHmac).toLowerCase(), "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
