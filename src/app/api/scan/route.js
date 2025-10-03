// src/app/api/scan/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { getInventoryByVariantGQL } from "@/lib/shopifyGraphql"; // ✅ GraphQL (2025-07)
import { getSalesByVariant } from "@/lib/shopifyRest";           // REST orders only (ok)
import { computeAlerts } from "@/lib/alertsEngine";
import { sendAlertEmail } from "@/lib/email";

/** Utility: YYYY-MM-DD key */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Unique hash (per day) used by your Alert upserts */
function makeUniqueHash(a) {
  return `${a.sku}|${a.severity}|${today()}`;
}

/** Merge computeAlerts output with extra "low stock threshold" alerts (dedup by SKU) */
function mergeWithThresholdAlerts(baseAlerts, invItems, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0) return baseAlerts;

  const bySku = new Map();
  for (const a of baseAlerts) if (!bySku.has(a.sku)) bySku.set(a.sku, a);

  for (const it of invItems) {
    const qty = Number(it.systemQty ?? 0);
    if (qty <= threshold && !bySku.has(it.sku)) {
      bySku.set(it.sku, {
        sku: it.sku,
        product: it.product || it.title || it.name || "",
        systemQty: qty,
        expectedMin: threshold + 1,
        expectedMax: threshold + 1,
        severity: "med",
      });
    }
  }
  return Array.from(bySku.values());
}

/** Normalize Shopify location id: supports gid or numeric strings */
function normalizeLocId(id) {
  const s = String(id || "");
  return s.includes("/Location/") ? s.split("/Location/").pop() : s;
}

export async function POST(req) {
  // ───────────────── Internal/Cron mode ─────────────────
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

      if (!store?.shop || !store?.accessToken) {
        return NextResponse.json(
          { skipped: true, reason: "store_not_found_or_incomplete" },
          { status: 200 }
        );
      }

      // Pro/Enterprise only for autoscan
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
        enforceStarterLimit: false,
      });

      const status = result.ok ? 200 : (result.statusCode || 500);
      return NextResponse.json(result.body, { status });
    }
  } catch (err) {
    console.error("Cron branch fatal:", err);
    // fall through
  }

  // ───────────────── Manual mode (from UI) ─────────────────
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
        store = await prisma.store.findFirst({ where: { userEmail: session.user.email } });
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
 * Do the work for one store.
 */
async function scanForStore({ store, sessionEmail, enforceStarterLimit }) {
  // Load settings
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

  // Starter limit (manual)
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
        } else if ((userSettings?.scanCount ?? 0) >= 3) {
          return { ok: false, statusCode: 403, body: { error: "scan_limit_reached" } };
        } else {
          await prisma.userSettings.update({
            where: { userEmail: store.userEmail },
            data: { scanCount: { increment: 1 } },
          });
        }
      }
    } catch (e) {
      console.warn("scan limit logic failed:", e?.message || e);
    }
  }

  // ── Inventory via GraphQL (no deprecated REST) ──
  let inventory = [];
  try {
    inventory = await getInventoryByVariantGQL(store.shop, store.accessToken, {
      multiLocation: useMultiLocation, // if true, includes per-location levels and total
    });
    if (!Array.isArray(inventory)) inventory = [];
  } catch (e) {
    console.error("Inventory fetch failed:", e);
    return {
      ok: false,
      statusCode: 502,
      body: { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
    };
  }

  // If multi-location and specific locations selected, re-sum to just those
  let inventoryForAlerts = inventory;
  try {
    if (useMultiLocation && selectedLocationIds.length > 0) {
      const wanted = new Set(selectedLocationIds.map(normalizeLocId));
      inventoryForAlerts = inventory.map((it) => {
        const levels = Array.isArray(it.levels) ? it.levels : [];
        const sum = levels.reduce((acc, lvl) => {
          const idNorm = normalizeLocId(lvl.locationId);
          return wanted.has(idNorm) ? acc + (Number(lvl.available) || 0) : acc;
        }, 0);
        return { ...it, systemQty: Number.isFinite(sum) ? sum : Number(it.systemQty ?? 0) };
      });
    }
  } catch (e) {
    console.warn("location filter sum failed (non-fatal):", e?.message || e);
    inventoryForAlerts = inventory;
  }

  // ── Sales map (REST orders; fine) ──
  let salesMap = {};
  try {
    salesMap = await getSalesByVariant(store.shop, store.accessToken);
    if (!salesMap || typeof salesMap !== "object") salesMap = {};
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    const scopeIssue = msg.includes("401") || msg.includes("403");
    if (scopeIssue) {
      salesMap = {}; // optional
    } else {
      console.error("Orders fetch failed:", e);
      return {
        ok: false,
        statusCode: 502,
        body: { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
      };
    }
  }

  // Alerts
  let alerts = [];
  try {
    alerts = computeAlerts(inventoryForAlerts, salesMap) || [];
    if (!Array.isArray(alerts)) alerts = [];
  } catch (e) {
    console.error("computeAlerts failed:", e);
    return { ok: false, statusCode: 500, body: { error: "alerts_engine_failed", message: e?.message || String(e) } };
  }

  // Extra low-stock threshold
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
            where: { storeId_uniqueHash: { storeId: store.id, uniqueHash: makeUniqueHash(a) } },
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
      return { ok: false, statusCode: 500, body: { error: "db_write_failed", message: e?.message || String(e) } };
    }
  }

  // Email notify (Pro/Enterprise)
  try {
    if (alerts.length > 0) {
      const to = userSettings?.notificationEmail;
      if ((plan === "pro" || plan === "enterprise") && to) {
        const high = alerts.filter((a) => a.severity === "high").length;
        const med = alerts.length - high;

        await sendAlertEmail({
          to,
          subject: `Ghost Stock – ${alerts.length} new alert${alerts.length === 1 ? "" : "s"}`,
          html: `
            <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
              <h2>Ghost Stock – ${alerts.length} new alert${alerts.length === 1 ? "" : "s"}</h2>
              <p>Shop: <b>${store.shop}</b></p>
              <p>High: <b>${high}</b> • Medium: <b>${med}</b></p>
              <p><a href="https://ghost-stock.co.uk/dashboard">Open dashboard</a></p>
              <hr/>
              <p style="color:#666;font-size:12px">You’re receiving this because email alerts are enabled in Settings.</p>
            </div>
          `,
          text: `New alerts: ${alerts.length} (High: ${high}, Med: ${med}) – https://ghost-stock.co.uk/dashboard`,
        });
      }
    }
  } catch (e) {
    console.warn("[scan] email notify failed:", e?.message || e);
  }

  // Touch lastScanAt
  try {
    await prisma.store.update({ where: { id: store.id }, data: { lastScanAt: new Date() } });
  } catch (e) {
    console.warn("Prisma update lastScanAt failed:", e?.message || e);
  }

  return { ok: true, body: { created_or_updated: alerts.length } };
}
