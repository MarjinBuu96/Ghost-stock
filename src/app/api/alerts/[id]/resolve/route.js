export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { computeKpisForUser } from "@/lib/kpis";
import { publish } from "@/lib/kpiBus";

export async function POST(req, { params }) {
  try {
    const store = await getActiveStore(req);
    if (!store) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const alertId = params?.id;
    if (!alertId) {
      return NextResponse.json({ error: "missing_alert_id" }, { status: 400 });
    }

    const updated = await prisma.alert.updateMany({
      where: { id: alertId, storeId: store.id },
      data: { status: "resolved" },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "not_found_or_not_owned" }, { status: 404 });
    }

    try {
      const kpis = await computeKpisForUser(store.userEmail);
      publish(store.userEmail, kpis);
    } catch (e) {
      console.warn("resolve: KPI recompute/publish failed:", e);
    }

    return NextResponse.json({ ok: true, id: alertId });
  } catch (e) {
    console.error("resolve error:", e);
    return NextResponse.json({ error: "server_error", message: e.message }, { status: 500 });
  }
}
