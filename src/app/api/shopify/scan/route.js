export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

// ---- NEW: verify Shopify App Bridge session token (HS256) ----
import { jwtVerify } from "jose";

async function getShopFromBearer(req) {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    const token = auth.slice("Bearer ".length).trim();
    const secret = new TextEncoder().encode(process.env.SHOPIFY_API_SECRET || "");
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      // not strictly required, but keeps us honest:
      // issuer looks like "https://{shop}.myshopify.com/admin"
      // audience == your API key
      audience: process.env.SHOPIFY_API_KEY || undefined,
    });
    // Shop lives in `dest` or can be derived from `iss`
    // dest example: "https://ghost-app.myshopify.com"
    const dest = (payload.dest || payload.iss || "").toString();
    const match = dest.match(/https?:\/\/([^/]+)/i);
    return match ? match[1].toLowerCase() : null; // e.g. "ghost-app.myshopify.com"
  } catch {
    return null;
  }
}

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

export async function POST(req) {
  try {
    // 1) First try embedded auth (reliable in iframe)
    const shopFromJwt = await getShopFromBearer(req);

    // 2) Fallback to NextAuth cookie session (works when not embedded)
    let session = null;
    if (!shopFromJwt) {
      session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // 3) Locate the store record
    const store = shopFromJwt
      ? await prisma.store.findUnique({ where: { shop: shopFromJwt } })
      : await prisma.store.findFirst({ where: { userEmail: session.user.email } });

    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    // 4) Fetch Shopify data (inventory required)
    let inventory = [];
    try {
      inventory = await getInventoryByVariant(store.shop, store.accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    // 5) Sales velocity is optional (missing read_orders -> assume 0)
    let salesMap = {};
    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("401") || msg.includes("403")) {
        salesMap = {};
      } else {
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
    }

    // 6) Compute & upsert alerts
    const alerts = computeAlerts(inventory, salesMap);

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
              userEmail: store.userEmail ?? null, // keep if you store it
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

    await prisma.store.update({
      where: { id: store.id },
      data: { lastScanAt: new Date() },
    });

    return NextResponse.json({ created_or_updated: alerts.length });
  } catch (err) {
    console.error("SCAN ERROR", err);
    return NextResponse.json(
      { error: "unexpected_server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
