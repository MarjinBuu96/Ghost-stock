// src/app/api/alerts/export/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { hasFeature, FEATURES } from "@/lib/entitlements";

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req) {
  try {
    // Identify the active shop (embedded app)
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Plan gate: CSV is allowed on all plans in your entitlements; keep the check anyway
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true },
    });
    const plan = (settings?.plan || "starter").toLowerCase();
    if (!hasFeature(plan, FEATURES.EXPORT_CSV)) {
      return NextResponse.json({ error: "feature_not_in_plan" }, { status: 403 });
    }

    // Optional filter ?status=open|closed|all (default open)
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "open").toLowerCase();
    const whereStatus =
      statusParam === "all" ? {} : { status: statusParam === "closed" ? "closed" : "open" };

    // Fetch alerts for this store
    const alerts = await prisma.alert.findMany({
      where: { storeId: store.id, ...whereStatus },
      orderBy: { createdAt: "desc" },
      select: {
        sku: true,
        product: true,
        systemQty: true,
        expectedMin: true,
        expectedMax: true,
        severity: true,
        status: true,
        createdAt: true,
      },
    });

    // Build CSV
    const headers = [
      "SKU",
      "Product",
      "SystemQty",
      "ExpectedMin",
      "ExpectedMax",
      "Severity",
      "Status",
      "CreatedAt",
    ];

    const rows = alerts.map((a) => [
      csvEscape(a.sku),
      csvEscape(a.product),
      a.systemQty ?? 0,
      a.expectedMin ?? 0,
      a.expectedMax ?? 0,
      csvEscape(a.severity || ""),
      csvEscape(a.status || ""),
      a.createdAt?.toISOString?.() || "",
    ]);

    // Add UTF-8 BOM so Excel opens it cleanly
    const csv =
      "\uFEFF" +
      [headers, ...rows].map((r) => r.join(",")).join("\n");

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ghost-stock-alerts-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("CSV export error:", err);
    return NextResponse.json({ error: "export_failed", message: String(err?.message || err) }, { status: 500 });
  }
}
