export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function POST(req, { params }) {
  const store = await getActiveStore(req);
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const roleErr = await requireRole(store.orgId, store.userEmail, "manager");
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: roleErr.statusCode || 403 });

  const body = await req.json().catch(() => ({}));
  const counted = Number(body.counted);

  const item = await prisma.countItem.findFirst({
    where: { id: params.itemId, sessionId: params.id },
    select: { id: true, sessionId: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.countItem.update({
    where: { id: item.id },
    data: { counted: isNaN(counted) ? null : counted, status: "counted" },
  });

  await logAudit(store.orgId, store.userEmail, "count.item.update", updated.id, { counted });

  return NextResponse.json({ item: updated });
}
