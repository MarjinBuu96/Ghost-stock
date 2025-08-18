import crypto from "crypto";

// For OAuth callback URLs (query-string HMAC)
export function verifyHmacFromUrl(fullUrl, secret) {
  const url = new URL(fullUrl);
  const params = new URLSearchParams(url.search);
  const hmac = params.get("hmac");
  params.delete("hmac");
  const message = params.toString();
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "utf8"), Buffer.from(digest, "utf8"));
  } catch {
    return false;
  }
}

// For webhooks (raw body + header)
export function verifyWebhookHmac(rawBody, headerHmac, secret) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(headerHmac || "", "utf8"), Buffer.from(digest, "utf8"));
  } catch {
    return false;
  }
}
