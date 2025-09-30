export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10);
  return `${a.sku}|${a.severity}|${day}`;
}

export async function POST(req) {
  // ─────────────────────────────────────────────────────────────────────────────
  // 🔐 Internal/Cron mode (authorized by CRON_SECRET) — runs for a specific shop
  // Call: POST /api/scan?shop=<shop.myshopify.com> with header:
  //   Authorization: Bearer <CRON_SECRET>
  // Skips Starter plan weekly limits; ONLY runs for Pro/Enterprise.
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
        // 200 so cron doesn’t retry forever
        return NextResponse.json({ skipped: true, reason: "store_not_found_or_incomplete" }, { status: 200 });
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
        return NextResponse.json({ skipped: true, reason: "not_pro_or_enterprise" }, { status: 200 });
      }

      const result = await scanForStore({
        store,
        sessionEmail: store.userEmail || null,
        enforceStarterLimit: false, // cron bypasses starter limits (already plan-checked)
      });

      const status = result.ok ? 200 : (result.statusCode || 500);
      return NextResponse.json(result.body, { status });
    }
  } catch (err) {
    console.error("Cron branch fatal:", err);
    // fall through to manual mode
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 👤 Manual mode (existing behavior)
  // Uses next-auth session or "shopify_shop" cookie to find the store.
  // Enforces Starter weekly scan limits.
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
  // 🔒 Optional Starter plan limit (manual mode only)
  if (enforceStarterLimit) {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userEmail: store.userEmail },
      });

      if (settings?.plan === "starter") {
        const now = new Date();

        // handle missing lastScanReset safely
        const last = settings.lastScanReset ? new Date(settings.lastScanReset) : new Date(0);
        const resetThreshold = new Date(last);
        resetThreshold.setDate(resetThreshold.getDate() + 7);

        if (now > resetThreshold) {
          await prisma.userSettings.update({
            where: { userEmail: store.userEmail },
            data: {
              scanCount: 1,
              lastScanReset: now,
            },
          });
          console.log("🔄 Scan count reset and incremented");
        } else if ((settings.scanCount ?? 0) >= 3) {
          console.log("⛔️ Scan limit reached for Starter plan");
          return { ok: false, statusCode: 403, body: { error: "scan_limit_reached" } };
        } else {
          await prisma.userSettings.update({
            where: { userEmail: store.userEmail },
            data: {
              scanCount: { increment: 1 },
            },
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

  // Compute alerts
  let alerts = [];
  try {
    alerts = computeAlerts(inventory, salesMap) || [];
    if (!Array.isArray(alerts)) alerts = [];
  } catch (e) {
    console.error("computeAlerts failed:", e);
    return {
      ok: false,
      statusCode: 500,
      body: { error: "alerts_engine_failed", message: e?.message || String(e) },
    };
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
