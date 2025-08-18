import crypto from "crypto";

export function shopifyAuthUrl({ shop, state, scopes, clientId, redirectUri }) {
  const base = `https://${shop}/admin/oauth/authorize`;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `${base}?${params.toString()}`;
}

export function verifyHmac(query, secret) {
  const { hmac, ...rest } = Object.fromEntries(Object.entries(query));
  const message = new URLSearchParams(rest).toString();
  const generated = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(generated, "utf8"), Buffer.from(hmac, "utf8"));
}

export async function exchangeToken({ shop, code, clientId, clientSecret }) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, scope }
}
