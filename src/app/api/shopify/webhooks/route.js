// src/app/api/shopify/webhooks/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHmac } from "@/lib/shopifyHmac";
import { recomputeForStore } from "@/lib/recomputeAlerts";
import { logAuditSafe } from "@/lib/audit";

const HANDLED_TOPICS = new Set([
  "orders/create",
  "inventory_levels/update",
  "app/uninstalled",
]);

export async function POST(req) {
  // 1) Read raw body FIRST (required for HMAC verify)
  const raw = await req.text();

  // 2) Headers
  const topic = (req.headers.get("x-shopify-topic") || "").toLowerCase();
  const shop = req.headers.get("x-shopify-shop-domain");
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  // 3) Validate HMAC
  if (!verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 4) Parse JSON after HMAC
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}

  // 5) Ignore topics we don't care about
  if (!HANDLED_TOPICS.has(topic)) {
    return NextResponse.json({ ok: true, ignored: topic });
  }

  // 6) Special case: app uninstalled => revoke the store token
  if (topic === "app/uninstalled") {
    await prisma.store.updateMany({ where: { shop }, data: { accessToken: "" } });
    await logAuditSafe({
      orgId: null,
      actor: shop,
      action: "app.uninstalled",
      target: shop,
      meta: {},
    });
    return NextResponse.json({ ok: true });
  }

  // 7) Load the store
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.accessToken) {
    return NextResponse.json({ error: "store_not_found_or_no_token" }, { status: 404 });
  }

  // 8) Recompute alerts (MVP: full recompute)
  try {
    await recomputeForStore(store, store.userEmail);
    await logAuditSafe({
      orgId: store.orgId ?? null,
      actor: shop,
      action: `webhook.${topic}`,
      target: shop,
      meta: { payloadSummary: { topic, id: payload?.id ?? null } },
    });
  } catch (e) {
    console.error("Webhook recompute error", e);
    return NextResponse.json({ error: "recompute_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
