// src/app/api/shopify/scan/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import {
  getInventoryByVariant,
  getInventoryByVariantMultiLocation, // wrapper that sums inventory_levels
  getSalesByVariant,
} from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";
import { publish } from "@/lib/kpiBus";
import { computeKpisForUser } from "@/lib/kpis";

// --- helpers ---------------------------------------------------------------

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

// write audit only if we have orgId and table exists; never block scan
async function logAuditSafe({ orgId, actor, action, target = null, meta = null }) {
  try {
    if (!orgId) return; // no orgs yet—skip
    // If your model requires orgId, this works. If the table isn't migrated yet, this will throw and be caught.
    await prisma.auditLog.create({
      data: { orgId, actor, action, target, meta },
    });
  } catch (e) {
    console.warn("Audit log failed:", e?.message || e);
  }
}

// --- route -----------------------------------------------------------------

export async function POST(req) {
  try {
    // 0) Identify active store (embedded cookie)
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // plan (for multi-location + Slack)
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true, slackWebhookUrl: true },
    });
    const plan = (settings?.plan || "starter").toLowerCase();
    const isProPlus = plan === "pro" || plan === "enterprise";

    // 1) Inventory
    let inventory = [];
    try {
      inventory = isProPlus
        ? await getInventoryByVariantMultiLocation(store.shop, store.accessToken)
        : await getInventoryByVariant(store.shop, store.accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    // 2) Sales (optional)
    let salesMap = {};
    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      const missingScope = msg.includes("401") || msg.includes("403");
      if (!missingScope) {
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
      salesMap = {};
    }

    // 3) Engine alerts
    const alerts = computeAlerts(inventory, salesMap);

    // 3b) (Enterprise) rules — soft import; skip if module not present
    try {
      if (store.orgId) {
        const RulesMod = await import("@/lib/rules").catch(() => null);
        if (RulesMod?.loadRulesForOrg && RulesMod?.evaluateRules) {
          const rules = await RulesMod.loadRulesForOrg(store.orgId);
          if (rules?.length) {
            const extra = RulesMod.evaluateRules(inventory, salesMap, rules) || [];
            if (extra.length) alerts.push(...extra);
          }
        }
      }
    } catch (e) {
      console.warn("Rules evaluation failed:", e?.message || e);
    }

    // 4) Persist alerts (dedupe by day)
    if (alerts.length > 0) {
      await prisma.$transaction(
        alerts.map((a) =>
          prisma.alert.upsert({
            where: {
              storeId_uniqueHash: { storeId: store.id, uniqueHash: makeUniqueHash(a) },
            },
            update: {
              systemQty: a.systemQty,
              expectedMin: a.expectedMin,
              expectedMax: a.expectedMax,
              severity: a.severity,
              status: "open",
            },
            create: {
              userEmail: store.userEmail, // for embedded we use shop as stable id
              storeId: store.id,
              sku: a.sku,
              product: a.product,
              systemQty: a.systemQty,
              expectedMin: a.expectedMin,
              expectedMax: a.expectedMax,
              severity: a.severity,
              status: "open",
              uniqueHash: makeUniqueHash(a),
            },
          })
        )
      );
    }

    // 4b) Audit one line per scan
    await logAuditSafe({
      orgId: store.orgId ?? null,
      actor: store.userEmail || store.shop,
      action: "scan.run",
      target: store.shop,
      meta: { alerts: alerts.length },
    });

    // 5) KPIs + broadcast
    try {
      const kpis = await computeKpisForUser(store.userEmail);
      publish(store.userEmail, kpis);
    } catch (e) {
      console.warn("KPI publish failed:", e);
    }

    // 6) Slack (Pro+)
    try {
      const webhook = settings?.slackWebhookUrl?.trim();
      if (alerts.length > 0 && webhook && isProPlus) {
        const top = alerts
          .slice(0, 5)
          .map(
            (a) =>
              `• ${a.sku} (${a.severity}) expected ${a.expectedMin}-${a.expectedMax}, system ${a.systemQty}`
          )
          .join("\n");
        const more = alerts.length > 5 ? `\n…+${alerts.length - 5} more` : "";
        const base =
          process.env.NEXT_PUBLIC_BASE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";
        const text =
          `⚠️ *Ghost Stock Alerts* for *${store.shop}* (${alerts.length} total)\n` +
          `${top}${more}\n` +
          `Open dashboard: ${base}/dashboard`;

        const resp = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) {
          console.warn("Slack webhook HTTP error:", resp.status, await resp.text().catch(() => ""));
        }
      }
    } catch (e) {
      console.warn("Slack webhook failed:", e);
    }

    return NextResponse.json({ created_or_updated: alerts.length });
  } catch (err) {
    console.error("SCAN ERROR", err);
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
