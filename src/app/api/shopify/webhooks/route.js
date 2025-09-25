// src/app/api/shopify/webhooks/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { recomputeForStore } from "@/lib/recomputeAlerts";
import { logAuditSafe } from "@/lib/audit";

// Topics we actively process with business logic
const BUSINESS_TOPICS = new Set([
  "orders/create",
  "inventory_levels/update",
  "app/uninstalled",
]);

// The 3 compliance topics Shopify requires every app to provide
const COMPLIANCE_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    // timing-safe compare
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function POST(req) {
  // 1) Read raw body FIRST (needed for HMAC)
  const raw = await req.text();

  // 2) Headers
  const topic = (req.headers.get("x-shopify-topic") || "").toLowerCase();
  const shop = req.headers.get("x-shopify-shop-domain");
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  // 3) Verify HMAC
  const okSig = verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET);
  if (!okSig) {
    // This 401 is what Shopify’s “Verifies HMAC” check expects for bad signatures
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  // 4) Parse payload AFTER verification
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // ignore
  }

  // 5) Mandatory compliance topics: acknowledge immediately (fast 200)
  if (COMPLIANCE_TOPICS.has(topic)) {
    await logAuditSafe({
      orgId: null,
      actor: shop,
      action: `compliance.${topic}`,
      target: shop,
      meta: { payloadId: payload?.id ?? null },
    });
    // You may enqueue your privacy handling here if needed.
    return NextResponse.json({ ok: true });
  }

  // 6) Business topics
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

  if (!BUSINESS_TOPICS.has(topic)) {
    // Unknown topic but valid signature → return 200
    return NextResponse.json({ ok: true, ignored: topic });
  }

  // 7) Recompute alerts for the store (your existing logic)
  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store || !store.accessToken) {
    return NextResponse.json({ error: "store_not_found_or_no_token" }, { status: 404 });
  }

  try {
    await recomputeForStore(store, store.userEmail);
    await logAuditSafe({
      orgId: store.orgId ?? null,
      actor: shop,
      action: `webhook.${topic}`,
      target: shop,
      meta: { payloadSummary: { topic, id: payload?.id ?? null } },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook recompute error", e);
    return NextResponse.json({ error: "recompute_failed" }, { status: 500 });
  }
}
