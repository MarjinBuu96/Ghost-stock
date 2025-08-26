// src/app/api/me/stores/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";

export async function GET(req) {
  const store = await getActiveStore(req);

  // Return 200 with empty array so the UI doesn’t show a scary error banner
  if (!store) {
    return NextResponse.json({ stores: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      stores: [
        {
          id: store.id,
          shop: store.shop,
          createdAt: store.createdAt,
          updatedAt: store.updatedAt,
        },
      ],
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
