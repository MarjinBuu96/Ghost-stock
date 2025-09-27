export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10);
  return `${a.sku}|${a.severity}|${day}`;
}

export async function POST() {
  try {
    // Session is optional (embedded apps may use cookie fallback)
    let session = null;
    try {
      session = await getServerSession(authOptions);
    } catch (e) {
      // Don’t crash if next-auth throws (misconfigured in prod, etc.)
      console.warn("getServerSession failed:", e?.message || e);
    }

    const shopCookie = cookies().get("shopify_shop")?.value || "";

    // Required env
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // Resolve store (prefer session email, fall back to cookie)
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

    // Shopify data
    let inventory = [];
    try {
      inventory = await getInventoryByVariant(store.shop, store.accessToken);
      if (!Array.isArray(inventory)) inventory = [];
    } catch (e) {
      console.error("Inventory fetch failed:", e);
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    let salesMap = {};
    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
      if (!salesMap || typeof salesMap !== "object") salesMap = {};
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      const scopeIssue = msg.includes("401") || msg.includes("403");
      if (scopeIssue) {
        salesMap = {}; // proceed with zero velocity if scope missing
      } else {
        console.error("Orders fetch failed:", e);
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
    }

    // Compute alerts (don’t allow errors to escape)
    let alerts = [];
    try {
      alerts = computeAlerts(inventory, salesMap) || [];
      if (!Array.isArray(alerts)) alerts = [];
    } catch (e) {
      console.error("computeAlerts failed:", e);
      return NextResponse.json(
        { error: "alerts_engine_failed", message: e?.message || String(e) },
        { status: 500 }
      );
    }

    // Persist alerts (transaction only if we have work)
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
                userEmail: session?.user?.email || store.userEmail || null,
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
        return NextResponse.json(
          { error: "db_write_failed", message: e?.message || String(e) },
          { status: 500 }
        );
      }
    }

    // Update last scan timestamp (don’t fail the whole request if this write fails)
    try {
      await prisma.store.update({
        where: { id: store.id },
        data: { lastScanAt: new Date() },
      });
    } catch (e) {
      console.warn("Prisma update lastScanAt failed:", e?.message || e);
    }

    return NextResponse.json({ created_or_updated: alerts.length });
  } catch (err) {
    console.error("SCAN ROUTE FATAL:", err);
    // Always return JSON so Vercel doesn't surface a 502
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
