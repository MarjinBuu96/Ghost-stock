export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHmac } from "@/lib/shopifyHmac";
import { recomputeForStore } from "@/lib/recomputeAlerts";
import { logAuditSafe } from "@/lib/audit";

const TOPICS_RECOMPUTE = new Set(["orders/create", "inventory_levels/update"]);
const TOPICS_COMPLIANCE = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export async function POST(req) {
  const raw = await req.text(); // raw body for HMAC
  const topic = (req.headers.get("x-shopify-topic") || "").toLowerCase();
  const shop = req.headers.get("x-shopify-shop-domain");
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET)) {
    return NextResponse.json({ error: "bad_hmac" }, { status: 401 });
  }

  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}

  // app/uninstalled => wipe token, return
  if (topic === "app/uninstalled") {
    await prisma.store.updateMany({ where: { shop }, data: { accessToken: "" } });
    await logAuditSafe({ orgId: null, actor: shop, action: "app.uninstalled", target: shop });
    return NextResponse.json({ ok: true });
  }

  // Compliance topics: acknowledge fast
  if (TOPICS_COMPLIANCE.has(topic)) {
    await logAuditSafe({ orgId: null, actor: shop, action: `webhook.${topic}`, target: shop });
    return NextResponse.json({ ok: true });
  }

  // Recompute for inventory/orders
  if (TOPICS_RECOMPUTE.has(topic)) {
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
        meta: { id: payload?.id ?? null },
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("Webhook recompute error", e);
      return NextResponse.json({ error: "recompute_failed" }, { status: 500 });
    }
  }

  // Unknown topic = OK
  return NextResponse.json({ ok: true, ignored: topic });
}
