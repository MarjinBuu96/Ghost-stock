// src/app/api/settings/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

async function getDefaultCurrencyForUser(userEmail) {
  const store = await prisma.store.findFirst({ where: { userEmail } });
  return store?.currency || "GBP";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let settings = await prisma.userSettings.findUnique({ where: { userEmail: session.user.email } });
  if (!settings) {
    settings = await prisma.userSettings.create({
      data: {
        userEmail: session.user.email,
        currency: await getDefaultCurrencyForUser(session.user.email),
      },
    });
  }
  return NextResponse.json({ settings });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currency = String(body.currency || "").toUpperCase();
  const allowed = new Set(["USD", "GBP", "EUR", "AUD", "CAD", "NZD"]);
  if (!allowed.has(currency)) {
    return NextResponse.json({ error: "unsupported_currency" }, { status: 400 });
  }

  const settings = await prisma.userSettings.upsert({
    where: { userEmail: session.user.email },
    update: { currency },
    create: { userEmail: session.user.email, currency },
  });

  return NextResponse.json({ settings });
}
