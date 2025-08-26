// src/app/api/alerts/[id]/start-count/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { logAuditSafe } from "@/lib/audit";

export async function POST(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Extract :id from /api/alerts/:id/start-count without using `params`
    const pathname = new URL(req.url).pathname; // e.g. /api/alerts/abc123/start-count
    const parts = pathname.split("/").filter(Boolean); // ["api","alerts",":id","start-count"]
    const idIdx = parts.indexOf("alerts") + 1;
    const alertId = parts[idIdx] || null;

    if (!alertId) return NextResponse.json({ error: "missing_alert_id" }, { status: 400 });

    // Ensure alert belongs to this store
    const alert = await prisma.alert.findFirst({
      where: { id: alertId, storeId: store.id },
      select: { id: true, sku: true, status: true },
    });
    if (!alert) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Optional: update status to "counting" (commented out to keep it visible in "open" filters)
    // await prisma.alert.update({ where: { id: alert.id }, data: { status: "counting" } });

    await logAuditSafe({
      orgId: store.orgId ?? null,
      actor: store.userEmail || store.shop,
      action: "count.start",
      target: alertId,
      meta: { sku: alert.sku },
    });

    return NextResponse.json({ ok: true, message: "Count started." });
  } catch (e) {
    console.error("start-count error:", e);
    return NextResponse.json(
      { error: "server_error", message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
