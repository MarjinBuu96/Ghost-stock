// src/lib/shopifyHmac.js
import crypto from "crypto";

/**
 * Verify Shopify webhook HMAC against your app's API secret.
 * - rawBody must be the *exact* bytes Shopify sent (use req.text()).
 * - hmacHeader is the base64 value from 'X-Shopify-Hmac-Sha256'.
 */
export function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!rawBody || !hmacHeader || !secret) return false;

  try {
    const computed = crypto
      .createHmac("sha256", secret)
      .update(Buffer.from(rawBody, "utf8"))
      .digest("base64");

    // timing-safe compare
    const a = Buffer.from(computed, "utf8");
    const b = Buffer.from(hmacHeader, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
