export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";




const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // or whatever version you're using
});

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { priceId } = await req.json();
    if (!priceId) return NextResponse.json({ error: "missing_priceId" }, { status: 400 });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "stripe_env_missing" }, { status: 500 });
    }

    // Ensure a Stripe customer
    let settings = await prisma.userSettings.upsert({
      where: { userEmail: session.user.email },
      update: {},
      create: { userEmail: session.user.email },
    });

    let customerId = settings.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: session.user.email });
      customerId = customer.id;
      await prisma.userSettings.update({
        where: { userEmail: session.user.email },
        data: { stripeCustomerId: customerId },
      });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?billing=cancelled`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    return NextResponse.json({ error: "checkout_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

// Friendly response if someone opens this endpoint in a browser
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed", hint: "Use POST to create a checkout session." }, { status: 405 });
}
