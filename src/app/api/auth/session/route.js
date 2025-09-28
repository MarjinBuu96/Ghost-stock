import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";

export async function POST(req) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const decoded = jwt.decode(token);
    if (!decoded?.dest) {
      console.error("Missing dest in token:", decoded);
      return NextResponse.json({ ok: false, error: "Missing dest in token" }, { status: 400 });
    }

    const shop = decoded.dest.replace(/^https?:\/\//, "");
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Invalid shop domain" }, { status: 400 });
    }

    // Fallback email to satisfy schema
    const fallbackEmail = "unknown@ghost-stock.co.uk";

    await prisma.store.upsert({
      where: { shop },
      update: { accessToken: token },
      create: {
        shop,
        accessToken: token,
        userEmail: fallbackEmail,
      },
    });

    return NextResponse.json({ ok: true, shop });
  } catch (err) {
    console.error("Session route error:", err);
    return NextResponse.json({ ok: false, error: "Server error", details: err.message }, { status: 500 });
  }
}
