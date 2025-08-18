import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req, { params }) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.alert.updateMany({
    where: { id: params.id, userEmail: session.user.email, status: "open" },
    data: { status: "resolved" },
  });

  return NextResponse.json({ ok: true });
}
