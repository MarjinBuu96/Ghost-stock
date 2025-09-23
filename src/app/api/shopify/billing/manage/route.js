// src/app/api/shopify/billing/manage/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";

/**
 * There isn't a public "manage portal" URL via API.
 * This route returns a sensible place in Shopify Admin.
 * You can replace with a custom internal management page later.
 */
export async function POST(req) {
  const store = await getActiveStore(req);
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = `https://${store.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
  return NextResponse.json({ url });
}
