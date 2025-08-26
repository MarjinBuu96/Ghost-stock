// src/app/api/cron/daily/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
// If your @ alias isn't set, use the relative import below instead
// import { runAutoScanForEligibleStores } from "../../../../lib/scanRunner";
import { runAutoScanForEligibleStores } from "@/lib/scanRunner";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("x-cron-key") || "";
  const queryKey = new URL(req.url).searchParams.get("key") || "";
  return secret && (header === secret || queryKey === secret);
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "daily cron ready" });
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runAutoScanForEligibleStores();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("CRON daily error:", e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
