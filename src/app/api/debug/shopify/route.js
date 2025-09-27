export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

async function shopifyGet(shop, token, path) {
  const url = `https://${shop}/admin/api/2025-07/${path}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = await prisma.store.findFirst({ where: { userEmail: session.user.email } });
  if (!store?.shop || !store?.accessToken) return NextResponse.json({ error: "no_store" }, { status: 400 });

  const shop = await shopifyGet(store.shop, store.accessToken, "shop.json");
  const scopes = await shopifyGet(store.shop, store.accessToken, "oauth/access_scopes.json");

  return NextResponse.json({
    shop,
    access_scopes: scopes,
    required_scopes: ["read_products", "read_inventory", "read_orders"],
  });
}
