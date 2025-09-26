import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = cookies();
    const shopCookie = cookieStore.get("shopify_shop");
    const shop = shopCookie?.value;

    if (!shop) {
      return NextResponse.json({ error: "missing_shop_cookie" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { shop } });

    if (!store) {
      return NextResponse.json({ error: "store_not_found", shop }, { status: 404 });
    }

    const alerts = await prisma.alert.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(alerts);
  } catch (err) {
    console.error("Alerts route crash:", err);
    return NextResponse.json({ error: "server_error", details: err.message }, { status: 500 });
  }
}
