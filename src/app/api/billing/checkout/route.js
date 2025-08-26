export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

export async function POST(req) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { priceId } = await req.json();
    if (!priceId) {
      return NextResponse.json({ error: "missing_priceId" }, { status: 400 });
    }

    const settings = await prisma.userSettings.upsert({
      where: { userEmail: token.email },
      update: {},
      create: { userEmail: token.email },
    });

    let customerId = settings.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: token.email });
      customerId = customer.id;
      await prisma.userSettings.update({
        where: { userEmail: token.email },
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
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "checkout_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed", hint: "Use POST to create a checkout session." }, { status: 405 });
}
