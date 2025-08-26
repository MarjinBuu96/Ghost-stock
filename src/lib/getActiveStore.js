// src/lib/getActiveStore.js
import { cookies as headerCookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Returns the Store row for the active embedded session.
 * Reads the `shopify_shop` cookie (must await cookies() in App Router).
 */
export async function getActiveStore(req) {
  let shop = null;

  // App Router dynamic API = must await
  try {
    const c = await headerCookies();
    shop = c.get("shopify_shop")?.value || null;
  } catch {
    /* no-op */
  }

  // Fallback: parse raw header (helps in edge cases/tests)
  if (!shop && req?.headers?.get) {
    const cookieHeader = req.headers.get("cookie") || "";
    const m = cookieHeader.match(/(?:^|;\s*)shopify_shop=([^;]+)/);
    if (m) shop = decodeURIComponent(m[1]);
  }

  if (!shop) return null;
  return (await prisma.store.findUnique({ where: { shop } })) || null;
}
