export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

async function getDefaultCurrencyForUser(userEmail) {
  const store = await prisma.store.findFirst({ where: { userEmail } });
  return store?.currency || "GBP";
}

export async function GET(req) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let settings = await prisma.userSettings.findUnique({
      where: { userEmail: token.email },
    });

    if (!settings) {
      const currency = await getDefaultCurrencyForUser(token.email);
      settings = await prisma.userSettings.create({
        data: {
          userEmail: token.email,
          currency,
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: "settings_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const currency = String(body.currency || "").toUpperCase();
    const allowed = new Set(["USD", "GBP", "EUR", "AUD", "CAD", "NZD"]);
    if (!allowed.has(currency)) {
      return NextResponse.json({ error: "unsupported_currency" }, { status: 400 });
    }

    const settings = await prisma.userSettings.upsert({
      where: { userEmail: token.email },
      update: { currency },
      create: { userEmail: token.email, currency },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: "settings_failed", message: String(err?.message || err) }, { status: 500 });
  }
}
