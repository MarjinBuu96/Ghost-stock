// src/app/api/shopify/webhooks/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHmac } from "@/lib/shopifyHmac";
import { recomputeForStore } from "@/lib/recomputeAlerts";
import { logAuditSafe } from "@/lib/audit";

// Topics we actively handle
const HANDLED_TOPICS = new Set([
  "orders/create",
  "inventory_levels/update",
  "app/uninstalled",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

// GDPR topics (fast-path)
const GDPR_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export async function POST(req) {
  // 1) Read raw body FIRST (required for HMAC verification)
  const raw = await req.text();

  // 2) Headers (Shopify standard)
  const topicRaw = req.headers.get("x-shopify-topic");
  const topic = (topicRaw || "").toLowerCase();
  const shop = req.headers.get("x-shopify-shop-domain") || "";
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
  const webhookId = req.headers.get("x-shopify-webhook-id") || ""; // helpful for logs

  // Basic header sanity
  if (!topic || !shop || !hmacHeader) {
    return NextResponse.json({ error: "missing_headers" }, { status: 400 });
  }

  // 3) Validate HMAC (using raw body)
  if (!process.env.SHOPIFY_API_SECRET) {
    // Hard fail in prod; prevents accepting unsigned requests
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  if (!verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 4) If we don’t care about this topic, 200 quickly
  if (!HANDLED_TOPICS.has(topic)) {
    return NextResponse.json({ ok: true, ignored: topic });
  }

  // 5) Parse JSON only when needed
  let payload = {};
  try {
    // For GDPR topics we don't actually need payload, but parse is cheap
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // ignore parse errors; not critical for our flow
  }

  // 6) GDPR topics → acknowledge & audit, no recompute
  if (GDPR_TOPICS.has(topic)) {
    try {
      await logAuditSafe({
        orgId: null,
        actor: shop,
        action: `webhook.${topic}`,
        target: shop,
        meta: {
          webhookId,
          payloadSummary: { id: payload?.id ?? null },
        },
      });
    } catch {
      // never fail webhook due to logging
    }
    return NextResponse.json({ ok: true });
  }

  // 7) app/uninstalled → revoke token & audit, then 200
  if (topic === "app/uninstalled") {
    try {
      await prisma.store.updateMany({ where: { shop }, data: { accessToken: "" } });
      await logAuditSafe({
        orgId: null,
        actor: shop,
        action: "app.uninstalled",
        target: shop,
        meta: { webhookId },
      });
    } catch (e) {
      // still return 200 to avoid retries; we'll see this in logs
      console.warn("Uninstall handling error:", e?.message || e);
    }
    return NextResponse.json({ ok: true });
  }

  // 8) For other handled topics, find store
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.accessToken) {
    // If the store isn't found or token revoked, just 200 (nothing to recompute)
    return NextResponse.json({ ok: true, note: "store_not_found_or_no_token" });
  }

  // 9) Recompute alerts (MVP full recompute) + audit
  try {
    await recomputeForStore(store, store.userEmail);
    await logAuditSafe({
      orgId: store.orgId ?? null,
      actor: shop,
      action: `webhook.${topic}`,
      target: shop,
      meta: {
        webhookId,
        payloadSummary: { id: payload?.id ?? null },
      },
    });
  } catch (e) {
    // Prefer returning 200 to avoid repeated retries; log for visibility
    console.error("Webhook recompute error:", topic, shop, e?.message || e);
    return NextResponse.json({ ok: false, handled: true });
  }

  return NextResponse.json({ ok: true });
}
