export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map plan names to env price IDs (must match your Stripe dashboard)
const PLAN_TO_PRICE = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || "").toLowerCase();

    if (!["starter", "pro", "enterprise"].includes(plan)) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    const priceId = PLAN_TO_PRICE[plan];
    if (!priceId) {
      return NextResponse.json({ error: `missing_price_for_${plan}` }, { status: 500 });
    }

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/settings?upgraded=1`,
      cancel_url: `${base}/settings?canceled=1`,
      customer_email: session.user.email, // simple path for MVP
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("Checkout error:", e);
    return NextResponse.json({ error: e?.message || "checkout_failed" }, { status: 500 });
  }
}
