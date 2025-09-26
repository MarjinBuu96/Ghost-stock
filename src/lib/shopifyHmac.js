import crypto from "crypto";

export function verifyOAuthQueryHmac(searchParams, hmacFromShop, secret) {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete("hmac");

  const msg = sp.toString(); // ✅ no decodeURIComponent

  const digest = crypto
    .createHmac("sha256", secret)
    .update(msg)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacFromShop));
}
