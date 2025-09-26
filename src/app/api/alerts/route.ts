import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const alerts = await prisma.alert.findMany({
    where: { userEmail: session.user.email, status: "open" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ alerts });
}
