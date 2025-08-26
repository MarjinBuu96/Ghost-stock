// src/app/api/debug/seed-alert/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";

// same dedupe convention used by your scan
function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const open = await prisma.alert.count({ where: { storeId: store.id, status: "open" } });
    const total = await prisma.alert.count({ where: { storeId: store.id } });
    const high = await prisma.alert.count({
      where: { storeId: store.id, status: "open", severity: "high" },
    });
    const med = await prisma.alert.count({
      where: { storeId: store.id, status: "open", severity: "med" },
    });

    return NextResponse.json({
      ok: true,
      store: store.shop,
      counts: { open, total, high, med },
    });
  } catch (err) {
    console.error("seed-alert GET error:", err);
    return NextResponse.json({ error: "seed_summary_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // how many alerts to seed (1..10)
    const count = Math.max(1, Math.min(10, Number(body.count ?? 2)));
    // force severity or let it alternate
    const severityForced = typeof body.severity === "string" ? body.severity.toLowerCase() : undefined;

    const created = [];
    for (let i = 0; i < count; i++) {
      const severity = severityForced ?? (i % 2 === 0 ? "high" : "med");
      const sku = body.sku ? `${String(body.sku)}-${i + 1}` : `SEED-${severity.toUpperCase()}-${String(i + 1).padStart(2, "0")}`;

      // a simple pair of examples: High = clear shortage, Med = borderline
      const a = {
        userEmail: store.userEmail,          // in embedded mode we store shop here
        storeId: store.id,
        sku,
        product: body.product || (severity === "high" ? "Widget Ultra" : "Widget Mini"),
        systemQty: severity === "high" ? 8 : 28,
        expectedMin: severity === "high" ? 40 : 25,
        expectedMax: severity === "high" ? 60 : 45,
        severity, // "high" | "med"
        status: "open",
        uniqueHash: "",                      // set below
      };
      a.uniqueHash = makeUniqueHash(a);

      const rec = await prisma.alert.upsert({
        where: { storeId_uniqueHash: { storeId: store.id, uniqueHash: a.uniqueHash } },
        update: {
          systemQty: a.systemQty,
          expectedMin: a.expectedMin,
          expectedMax: a.expectedMax,
          severity: a.severity,
          status: "open",
        },
        create: a,
      });
      created.push(rec);
    }

    // optional: change plan to pro/enterprise for testing
    const url = new URL(req.url);
    const planParam = (body.plan || url.searchParams.get("plan"))?.toString().toLowerCase();
    let plan = null;
    if (planParam === "pro" || planParam === "enterprise") {
      plan = planParam;
      await prisma.userSettings.upsert({
        where: { userEmail: store.userEmail },
        update: { plan },
        create: {
          userEmail: store.userEmail,
          plan,
          currency: store.currency || "GBP",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      ids: created.map((x) => x.id),
      planChangedTo: plan,
    });
  } catch (err) {
    console.error("seed-alert POST error:", err);
    return NextResponse.json({ error: "seed_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // delete only today's seeded alerts, by uniqueHash suffix YYYY-MM-DD
    const day = new Date().toISOString().slice(0, 10);
    const deleted = await prisma.alert.deleteMany({
      where: {
        storeId: store.id,
        uniqueHash: { endsWith: `|${day}` },
      },
    });

    return NextResponse.json({ ok: true, deleted: deleted.count, day });
  } catch (err) {
    console.error("seed-alert DELETE error:", err);
    return NextResponse.json({ error: "seed_clear_failed", message: String(err?.message || err) }, { status: 500 });
  }
}
