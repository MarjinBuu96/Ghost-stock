// src/app/api/scan/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";
import { sendAlertEmail } from "@/lib/email"; // ✅

const SHOPIFY_API_VERSION = "2025-07";

/** Utility: YYYY-MM-DD key */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Unique hash (per day) used by your Alert upserts */
function makeUniqueHash(a) {
  return `${a.sku}|${a.severity}|${today()}`;
}

/**
 * Fetch inventory levels for many inventory_item_ids, optionally restricted to location_ids.
 * Returns a Map<inventory_item_id, summedAvailable>.
 */
async function fetchInventoryLevelsMap(shop, accessToken, inventoryItemIds = [], locationIds = []) {
  const out = new Map();
  if (!Array.isArray(inventoryItemIds) || inventoryItemIds.length === 0) return out;

  // Shopify REST limits: chunk inventory_item_ids (50 per request is safe)
  const chunk = (arr, n) => {
    const res = [];
    for (let i = 0; i < arr.length; i += n) res.push(arr.slice(i, i + n));
    return res;
  };

  const idChunks = chunk(inventoryItemIds, 50);
  const locParam = (Array.isArray(locationIds) && locationIds.length > 0)
    ? `&location_ids=${encodeURIComponent(locationIds.join(","))}`
    : "";

  for (const ids of idChunks) {
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?inventory_item_ids=${encodeURIComponent(
      ids.join(",")
    )}${locParam}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`inventory_levels HTTP ${resp.status}: ${text}`);
    }

    const json = await resp.json();
    const levels = Array.isArray(json?.inventory_levels) ? json.inventory_levels : [];

    for (const lvl of levels) {
      const key = String(lvl.inventory_item_id);
      const prev = out.get(key) ?? 0;
      const available = Number(lvl.available ?? 0);
      out.set(key, prev + (Number.isFinite(available) ? available : 0));
    }
  }

  return out;
}

/** Merge computeAlerts output with extra "low stock threshold" alerts (dedup by SKU) */
function mergeWithThresholdAlerts(baseAlerts, invItems, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0) return baseAlerts;

  const bySku = new Map();
  for (const a of baseAlerts) {
    if (!bySku.has(a.sku)) bySku.set(a.sku, a);
  }

  for (const it of invItems) {
    const qty = Number(it.systemQty ?? 0);
    if (qty <= threshold) {
      if (!bySku.has(it.sku)) {
        // Create a conservative MED alert if not already present
        bySku.set(it.sku, {
          sku: it.sku,
          product: it.product || it.title || it.name || "",
          systemQty: qty,
          // Use threshold as a helpful band hint; caller can style however they like
          expectedMin: threshold + 1,
          expectedMax: threshold + 1,
          severity: "med",
        });
      }
    }
  }

  return Array.from(bySku.values());
}

/**
 * Main handler
 */
export async function POST(req) {
  // ─────────────────────────────────────────────────────────────────────────────
  // 🔐 Internal/Cron mode (Authorization: Bearer <CRON_SECRET>)
  // POST /api/scan?shop=<shop.myshopify.com>
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const isCronCall = token && token === (process.env.CRON_SECRET || "");
    const url = new URL(req.url);
    const shopFromQuery = url.searchParams.get("shop");

    if (isCronCall) {
      if (!shopFromQuery) {
        return NextResponse.json({ error: "missing_shop_param" }, { status: 400 });
      }

      let store = null;
      try {
        store = await prisma.store.findUnique({ where: { shop: shopFromQuery } });
      } catch (e) {
        console.error("Cron: store lookup failed:", e);
        return NextResponse.json({ error: "db_lookup_failed" }, { status: 500 });
      }

      if (!store || !store.shop || !store.accessToken) {
        return NextResponse.json(
          { skipped: true, reason: "store_not_found_or_incomplete" },
          { status: 200 }
        );
      }

      // Ensure Pro/Enterprise for autoscan
      let plan = "starter";
      try {
        const settings = await prisma.userSettings.findUnique({
          where: { userEmail: store.userEmail },
        });
        plan = String(settings?.plan || "starter").toLowerCase();
      } catch (e) {
        console.warn("Cron: userSettings lookup failed (default starter):", e?.message || e);
      }

      if (!(plan === "pro" || plan === "enterprise")) {
        return NextResponse.json(
          { skipped: true, reason: "not_pro_or_enterprise" },
          { status: 200 }
        );
      }

      const result = await scanForStore({
        store,
        sessionEmail: store.userEmail || null,
        enforceStarterLimit: false, // autoscan bypass (we already plan-check)
      });

      const status = result.ok ? 200 : (result.statusCode || 500);
      return NextResponse.json(result.body, { status });
    }
  } catch (err) {
    console.error("Cron branch fatal:", err);
    // fall through to manual mode
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 👤 Manual mode
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    let session = null;
    try {
      const [{ getServerSession }, { authOptions }] = await Promise.all([
        import("next-auth"),
        import("@/lib/authOptions"),
      ]);
      session = await getServerSession(authOptions);
    } catch (e) {
      console.warn("Optional next-auth session failed:", e?.message || e);
    }

    const shopCookie = cookies().get("shopify_shop")?.value || "";

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    let store = null;
    try {
      if (session?.user?.email) {
        store = await prisma.store.findFirst({
          where: { userEmail: session.user.email },
        });
      }
      if (!store && shopCookie) {
        store = await prisma.store.findUnique({ where: { shop: shopCookie } });
      }
    } catch (e) {
      console.error("Prisma store lookup failed:", e);
      return NextResponse.json({ error: "db_lookup_failed" }, { status: 500 });
    }

    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    const result = await scanForStore({
      store,
      sessionEmail: session?.user?.email || store.userEmail || null,
      enforceStarterLimit: true,
    });

    const status = result.ok ? 200 : (result.statusCode || 500);
    return NextResponse.json(result.body, { status });
  } catch (err) {
    console.error("SCAN ROUTE FATAL:", err);
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * Runs the actual scan work for a given store.
 * Returns { ok: boolean, statusCode?: number, body: object }
 */
async function scanForStore({ store, sessionEmail, enforceStarterLimit }) {
  // Load settings (threshold + multi-location prefs)
  let userSettings = null;
  try {
    userSettings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
    });
  } catch (e) {
    console.warn("settings load failed:", e?.message || e);
  }

  const plan = String(userSettings?.plan || "starter").toLowerCase();
  const lowStockThreshold = Number.isFinite(Number(userSettings?.lowStockThreshold))
    ? Math.max(0, Math.floor(Number(userSettings.lowStockThreshold)))
    : 5;

  const useMultiLocation = !!userSettings?.useMultiLocation && (plan === "pro" || plan === "enterprise");
  const selectedLocationIds = Array.isArray(userSettings?.locationIds) ? userSettings.locationIds : [];

  // 🔒 Starter plan limit (manual mode only)
  if (enforceStarterLimit) {
    try {
      if (plan === "starter") {
        const now = new Date();
        const last = userSettings?.lastScanReset ? new Date(userSettings.lastScanReset) : new Date(0);
        const resetThreshold = new Date(last);
        resetThreshold.setDate(resetThreshold.getDate() + 7);

        if (now > resetThreshold) {
          await prisma.userSettings.update({
            where: { userEmail: store.userEmail },
            data: { scanCount: 1, lastScanReset: now },
          });
          console.log("🔄 Scan count reset and incremented");
        } else if ((userSettings?.scanCount ?? 0) >= 3) {
          console.log("⛔️ Scan limit reached for Starter plan");
          return { ok: false, statusCode: 403, body: { error: "scan_limit_reached" } };
        } else {
          await prisma.userSettings.update({
            where: { userEmail: store.userEmail },
            data: { scanCount: { increment: 1 } },
          });
          console.log("📈 Scan count incremented");
        }
      }
    } catch (e) {
      console.warn("⚠️ Scan limit logic failed:", e?.message || e);
      // Non-fatal; continue
    }
  }

  // Shopify pulls
  let inventory = [];
  try {
    inventory = await getInventoryByVariant(store.shop, store.accessToken);
    if (!Array.isArray(inventory)) inventory = [];
  } catch (e) {
    console.error("Inventory fetch failed:", e);
    return {
      ok: false,
      statusCode: 502,
      body: { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
    };
  }

  // If Pro/Enterprise + multi-location enabled, aggregate system qty across locations
  let inventoryForAlerts = inventory;
  try {
    if (useMultiLocation) {
      // Build map of inventory_item_id -> summed available (optionally over selected locations)
      const itemIds = Array.from(
        new Set(
          inventory
            .map((x) => String(x.inventory_item_id || x.inventoryItemId || "").trim())
            .filter(Boolean)
        )
      );

      if (itemIds.length > 0) {
        const levelsMap = await fetchInventoryLevelsMap(
          store.shop,
          store.accessToken,
          itemIds,
          selectedLocationIds
        );

        // Replace systemQty with summed available where present
        inventoryForAlerts = inventory.map((it) => {
          const key = String(it.inventory_item_id || it.inventoryItemId || "").trim();
          const summed = levelsMap.get(key);
          return {
            ...it,
            systemQty: Number.isFinite(summed) ? summed : Number(it.systemQty ?? 0),
          };
        });
      }
    }
  } catch (e) {
    console.warn("Multi-location aggregation failed (non-fatal fallback):", e?.message || e);
    inventoryForAlerts = inventory; // fallback to original qty
  }

  let salesMap = {};
  try {
    salesMap = await getSalesByVariant(store.shop, store.accessToken);
    if (!salesMap || typeof salesMap !== "object") salesMap = {};
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    const scopeIssue = msg.includes("401") || msg.includes("403");
    if (scopeIssue) {
      salesMap = {};
    } else {
      console.error("Orders fetch failed:", e);
      return {
        ok: false,
        statusCode: 502,
        body: { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
      };
    }
  }

  // Compute alerts from engine
  let alerts = [];
  try {
    alerts = computeAlerts(inventoryForAlerts, salesMap) || [];
    if (!Array.isArray(alerts)) alerts = [];
  } catch (e) {
    console.error("computeAlerts failed:", e);
    return {
      ok: false,
      statusCode: 500,
      body: { error: "alerts_engine_failed", message: e?.message || String(e) },
    };
  }

  // Add extra low-stock threshold alerts when not already covered
  try {
    alerts = mergeWithThresholdAlerts(alerts, inventoryForAlerts, lowStockThreshold);
  } catch (e) {
    console.warn("threshold merge failed:", e?.message || e);
  }

  // Upsert alerts
  if (alerts.length > 0) {
    try {
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
              userEmail: sessionEmail,
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
    } catch (e) {
      console.error("Prisma upsert alerts failed:", e);
      return {
        ok: false,
        statusCode: 500,
        body: { error: "db_write_failed", message: e?.message || String(e) },
      };
    }
  }

  // ✅ Email notify (Pro/Enterprise) when alerts exist and a notification email is set
  try {
    if (alerts.length > 0) {
      const to = userSettings?.notificationEmail;
      if ((plan === "pro" || plan === "enterprise") && to) {
        const high = alerts.filter((a) => a.severity === "high").length;
        const med = alerts.length - high;

        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
            <h2>Ghost Stock – ${alerts.length} new alert${alerts.length === 1 ? "" : "s"}</h2>
            <p>Shop: <b>${store.shop}</b></p>
            <p>High: <b>${high}</b> • Medium: <b>${med}</b></p>
            <p><a href="https://ghost-stock.co.uk/dashboard">Open dashboard</a></p>
            <hr/>
            <p style="color:#666;font-size:12px">You’re receiving this because email alerts are enabled in Settings.</p>
          </div>
        `;

        await sendAlertEmail({
          to,
          subject: `Ghost Stock – ${alerts.length} new alert${alerts.length === 1 ? "" : "s"}`,
          html,
          text: `New alerts: ${alerts.length} (High: ${high}, Med: ${med}) – https://ghost-stock.co.uk/dashboard`,
        });
      }
    }
  } catch (e) {
    console.warn("[scan] email notify failed:", e?.message || e);
    // non-fatal
  }

  // Touch lastScanAt
  try {
    await prisma.store.update({
      where: { id: store.id },
      data: { lastScanAt: new Date() },
    });
  } catch (e) {
    console.warn("Prisma update lastScanAt failed:", e?.message || e);
    // non-fatal
  }

  return { ok: true, body: { created_or_updated: alerts.length } };
}
