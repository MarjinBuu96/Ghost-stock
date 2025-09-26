// src/lib/shopifyHmac.js (add this)
import crypto from "crypto";

export function verifyOAuthQueryHmac(searchParams, hmacFromShop, secret) {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete("hmac"); // exclude hmac itself
  const msg = decodeURIComponent(sp.toString()); // RFC compliant
  const digest = crypto
    .createHmac("sha256", secret)
    .update(msg)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacFromShop));
}
