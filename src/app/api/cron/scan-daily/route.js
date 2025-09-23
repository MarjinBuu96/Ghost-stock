export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeForStore } from "@/lib/recomputeAlerts";

export async function POST(req) {
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where: { accessToken: { not: "" } },
    select: { id: true, shop: true, userEmail: true, accessToken: true },
  });

  let ran = 0, failed = 0;
  for (const s of stores) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { userEmail: s.userEmail } });
      const plan = String(settings?.plan || "starter").toLowerCase();
      if (plan === "pro" || plan === "enterprise") {
        await recomputeForStore(s, s.userEmail);
        ran++;
      }
    } catch (e) {
      console.warn("Auto-scan failed for", s.shop, e?.message || e);
      failed++;
    }
  }
  return NextResponse.json({ ok: true, ran, failed });
}
