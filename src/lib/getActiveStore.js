// src/lib/getActiveStore.js
import { cookies as headerCookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

/**
 * Returns the Store row for the active embedded session.
 * Tries cookie first, then falls back to decoding session token.
 */
export async function getActiveStore(req) {
  let shop = null;

  // 1️⃣ Try cookie (App Router dynamic API)
  try {
    const c = await headerCookies();
    shop = c.get("shopify_shop")?.value || null;
  } catch {
    /* no-op */
  }

  // 2️⃣ Fallback: parse raw cookie header
  if (!shop && req?.headers?.get) {
    const cookieHeader = req.headers.get("cookie") || "";
    const m = cookieHeader.match(/(?:^|;\s*)shopify_shop=([^;]+)/);
    if (m) shop = decodeURIComponent(m[1]);
  }

  // 3️⃣ Fallback: decode session token
  if (!shop && req?.headers?.get) {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.decode(token);
    shop = decoded?.dest?.replace(/^https:\/\/|\/admin$/g, "") || null;
  }

  if (!shop) return null;

  return await prisma.store.findUnique({ where: { shop } });
}
