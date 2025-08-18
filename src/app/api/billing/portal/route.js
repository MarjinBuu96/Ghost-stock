export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const settings = await prisma.userSettings.findUnique({ where: { userEmail: session.user.email } });
    if (!settings?.stripeCustomerId) {
      return NextResponse.json({ error: "no_customer" }, { status: 400 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "stripe_env_missing" }, { status: 500 });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: settings.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err) {
    return NextResponse.json({ error: "portal_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed", hint: "Use POST to open the billing portal." }, { status: 405 });
}

