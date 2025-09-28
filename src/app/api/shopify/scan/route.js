// src/app/api/shopify/scan/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

import { getInventoryByVariant, getSalesByVariant } from "@/lib/shopifyRest";
import { computeAlerts } from "@/lib/alertsEngine";

// ---------- Helpers ----------
function b64urlToBuf(s) {
  // base64url -> base64
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  // pad
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return Buffer.from(s + "=".repeat(pad), "base64");
}

function decodePart(part) {
  try {
    const json = b64urlToBuf(part).toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Verifies a Shopify App Bridge session token (HS256 with your API secret).
 * Returns `{ shop }` on success or `{ error, status }` on failure.
 */
function verifyShopifyBearer(authHeader) {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: "missing_bearer", status: 401 };
  }
  const token = authHeader.slice(7).trim();
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  if (!secret || !apiKey) {
    return { error: "shopify_env_missing", status: 500 };
  }

  const parts = token.split(".");
  if (parts.length !== 3) return { error: "bad_jwt_format", status: 401 };

  const [h, p, sig] = parts;
  const header = decodePart(h);
  const payload = decodePart(p);
  if (!header || !payload) return { error: "bad_jwt_parts", status: 401 };
  if (header.alg !== "HS256") return { error: "bad_alg", status: 401 };

  // signature check
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64url");
  if (expected !== sig) return { error: "bad_signature", status: 401 };

  // optional checks: aud === apiKey, exp not expired
  if (payload.aud && payload.aud !== apiKey) {
    return { error: "bad_audience", status: 401 };
  }
  if (payload.exp && Date.now() / 1000 > Number(payload.exp)) {
    return { error: "token_expired", status: 401 };
  }

  // derive shop from dest or iss
  const dest = String(payload.dest || payload.iss || "");
  const m = dest.match(/https?:\/\/([^/]+)/i);
  const shop = m ? m[1].toLowerCase() : null;
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return { error: "shop_not_found_in_token", status: 401 };
  }

  return { shop };
}

function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

// ---------- Route ----------
export async function POST(req) {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");

    // Prefer embedded token (iframe-safe)
    let shop = null;
    if (auth) {
      const v = verifyShopifyBearer(auth);
      if (v.error) {
        // Log and return a clean 401/4xx instead of 502
        console.warn("scan bearer verify failed:", v.error);
        return NextResponse.json({ error: v.error }, { status: v.status });
      }
      shop = v.shop;
    }

    // Fallback for non-embedded testing if no bearer is present
    let session = null;
    if (!shop) {
      session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "shopify_env_missing" }, { status: 500 });
    }

    // Resolve store
    const store = shop
      ? await prisma.store.findUnique({ where: { shop } })
      : await prisma.store.findFirst({ where: { userEmail: session.user.email } });

    if (!store) return NextResponse.json({ error: "no_store" }, { status: 400 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    // Inventory (required)
    let inventory = [];
    try {
      inventory = await getInventoryByVariant(store.shop, store.accessToken);
    } catch (e) {
      console.error("inventory fetch error:", e);
      return NextResponse.json(
        { error: "shopify_api_error", where: "inventory", message: e?.message || String(e) },
        { status: 502 }
      );
    }

    // Sales (optional)
    let salesMap = {};
    try {
      salesMap = await getSalesByVariant(store.shop, store.accessToken);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("401") || msg.includes("403")) {
        salesMap = {};
      } else {
        console.error("orders fetch error:", e);
        return NextResponse.json(
          { error: "shopify_api_error", where: "orders", message: e?.message || String(e) },
          { status: 502 }
        );
      }
    }

    // Compute & upsert alerts
    const alerts = computeAlerts(inventory, salesMap);
    if (alerts.length > 0) {
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
              userEmail: store.userEmail ?? null,
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
