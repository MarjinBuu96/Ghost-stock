export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions"; // if alias doesn't work: "../../../lib/authOptions"
import { prisma } from "@/lib/prisma";           // or "../../../lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where: { userEmail: session.user.email },
    select: { id: true, shop: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ stores });
}
