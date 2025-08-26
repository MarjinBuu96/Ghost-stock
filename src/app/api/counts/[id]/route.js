export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function GET(req, { params }) {
  const store = await getActiveStore(req);
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.countSession.findFirst({
    where: { id: params.id, orgId: store.orgId },
    include: { items: true },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ session });
}

export async function POST(req, { params }) {
  const store = await getActiveStore(req);
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const roleErr = await requireRole(store.orgId, store.userEmail, "manager");
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: roleErr.statusCode || 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "complete") {
    const session = await prisma.countSession.update({
      where: { id: params.id },
      data: { status: "completed", completedAt: new Date() },
    });
    await logAudit(store.orgId, store.userEmail, "count.complete", params.id, {});
    return NextResponse.json({ session });
  }

  return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
}
