// src/app/api/lifecycle/status/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { getLifecycleStatusForStore, buildNudgeBanners } from "@/lib/lifecycle";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const status = await getLifecycleStatusForStore(store);
    const nudges = buildNudgeBanners(status);
    return NextResponse.json({ status, nudges });
  } catch (e) {
    console.error("lifecycle status error:", e);
    return NextResponse.json({ error: "lifecycle_failed" }, { status: 500 });
  }
}
