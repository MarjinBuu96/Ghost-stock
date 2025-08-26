export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { requireEntitlement, FEATURES } from "@/lib/entitlements";

function toCSV(rows) {
  const header = ["SKU","Product","SystemQty","ExpectedMin","ExpectedMax","Severity","Status","CreatedAt"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const vals = [
      r.sku, r.product, r.systemQty, r.expectedMin, r.expectedMax, r.severity, r.status,
      new Date(r.createdAt).toISOString()
    ].map(v => String(v).replace(/"/g,'""'));
    lines.push(vals.map(v => `"${v}"`).join(","));
  }
  return lines.join("\n");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plan = session.user.planTier ?? "starter";
  try { requireEntitlement(plan, FEATURES.EXPORT_CSV); }
  catch (e) { return NextResponse.json({ error: e.message, feature: e.feature }, { status: e.status || 400 }); }

  const alerts = await prisma.alert.findMany({
    where: { userEmail: session.user.email, status: "open" },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCSV(alerts);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghost-alerts-${Date.now()}.csv"`,
    },
  });
}
