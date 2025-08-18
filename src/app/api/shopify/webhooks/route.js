export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHmac } from "@/lib/shopifyHmac";
import { recomputeForStore } from "@/lib/recomputeAlerts";

const HANDLED_TOPICS = new Set([
  "orders/create",
  "inventory_levels/update",
  "app/uninstalled",
]);

export async function POST(req) {
  // Read raw body FIRST (for HMAC)
  const raw = await req.text();
  const topic = req.headers.get("x-shopify-topic");
  const shop = req.headers.get("x-shopify-shop-domain");
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // Parse after HMAC verification
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // ignore
  }

  if (!HANDLED_TOPICS.has(topic)) {
    return NextResponse.json({ ok: true, ignored: topic });
  }

  // app/uninstalled => revoke token and stop
  if (topic === "app/uninstalled") {
    await prisma.store.updateMany({ where: { shop }, data: { accessToken: "" } });
    return NextResponse.json({ ok: true });
  }

  // Find store and recompute alerts (MVP: full recompute)
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.accessToken) {
    return NextResponse.json({ error: "store_not_found_or_no_token" }, { status: 404 });
  }

  try {
    await recomputeForStore(store, store.userEmail);
  } catch (e) {
    console.error("Webhook recompute error", e);
    return NextResponse.json({ error: "recompute_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
