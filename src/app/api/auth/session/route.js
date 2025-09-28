// src/app/api/auth/session/route.js

import { NextResponse } from "next/server";

export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    console.warn("⚠️ No session token received");
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  console.log("✅ Session token received:", token);

  return NextResponse.json({ ok: true });
}
