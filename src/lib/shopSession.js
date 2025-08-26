import crypto from "crypto";

const COOKIE = "gs_session";
const SEP = ".";

// sign payload with HMAC so it can't be tampered with
function sign(payload) {
  const secret = process.env.SHOP_SESSION_SECRET || "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createShopSession(res, data) {
  // data: { shop, storeId }
  const payload = JSON.stringify({ ...data, t: Date.now() });
  const value = Buffer.from(payload).toString("base64") + SEP + sign(payload);
  res.cookies.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function readShopSession(req) {
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return null;
  const [b64, sig] = raw.split(SEP);
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64").toString();
  const expected = sign(payload);
  if (sig !== expected) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

export function clearShopSession(res) {
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
}
