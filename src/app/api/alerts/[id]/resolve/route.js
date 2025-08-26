export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

// ✅ use shared KPI calc + SSE publisher instead of refetching HTTP
import { computeKpisForUser } from "@/lib/kpis";
import { publish } from "@/lib/kpiBus";

export async function POST(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const userEmail = session.user.email;
    const alertId = params?.id;

    if (!alertId) {
      return NextResponse.json({ error: "missing_alert_id" }, { status: 400 });
    }

    // Mark alert as resolved (scoped to user for safety)
    const updated = await prisma.alert.updateMany({
      where: { id: alertId, userEmail },
      data: { status: "resolved" },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "not_found_or_not_owned" }, { status: 404 });
    }

    // Recompute KPIs and push to any connected dashboards
    try {
      const kpis = await computeKpisForUser(userEmail);
      publish(userEmail, kpis); // no-op if you haven't wired SSE listeners yet
    } catch (e) {
      console.warn("resolve: KPI recompute/publish failed:", e);
    }

    return NextResponse.json({ ok: true, id: alertId });
  } catch (e) {
    console.error("resolve error:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
