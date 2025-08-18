export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { getInventoryByVariant } from "@/lib/shopifyRest";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = await prisma.store.findFirst({ where: { userEmail: session.user.email } });
  if (!store?.shop || !store?.accessToken) {
    return NextResponse.json({ error: "no_store" }, { status: 400 });
  }

  try {
    const rows = await getInventoryByVariant(store.shop, store.accessToken);
    return NextResponse.json({ count: rows.length, items: rows.slice(0, 50) });
  } catch (e) {
    return NextResponse.json(
      { error: "shopify_api_error", message: e?.message || String(e) },
      { status: 502 }
    );
  }
}
