// src/app/api/billing/shopify/ensure/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { createOrConfirmSubscription } from "@/lib/shopifyBilling";

export async function POST(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { plan = "pro" } = await req.json().catch(() => ({}));
    const base =
      process.env.SHOPIFY_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      new URL("/", req.url).toString().replace(/\/$/, "");

    const returnUrl = `${base}/settings?upgraded=1`;

    const { alreadyActive, confirmationUrl } = await createOrConfirmSubscription({
      shop: store.shop,
      token: store.accessToken,
      plan,
      returnUrl,
    });

    // Optimistically set plan once merchant confirms; you may confirm via webhook too
    await prisma.userSettings.upsert({
      where: { userEmail: store.userEmail },
      update: { plan },
      create: { userEmail: store.userEmail, currency: store.currency || "GBP", plan },
    });

    return NextResponse.json({ url: confirmationUrl, alreadyActive });
  } catch (e) {
    console.error("Billing ensure error:", e);
    return NextResponse.json({ error: "billing_failed", message: String(e?.message || e) }, { status: 500 });
  }
}
