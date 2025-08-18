export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle subscription events
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object;
    const customerId = sub.customer;

    // get email from customer
    const customer = await stripe.customers.retrieve(customerId);
    const email = customer.email;
    if (email) {
      // infer plan from price
      const priceId = sub.items?.data?.[0]?.price?.id || "";
      let plan = "starter";
      if (priceId === process.env.STRIPE_PRICE_PRO) plan = "pro";

      await prisma.userSettings.upsert({
        where: { userEmail: email },
        update: { plan, stripeCustomerId: customerId },
        create: { userEmail: email, plan, stripeCustomerId: customerId },
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customerId = sub.customer;
    // Find user by customer id
    const settings = await prisma.userSettings.findFirst({ where: { stripeCustomerId: customerId } });
    if (settings) {
      await prisma.userSettings.update({
        where: { userEmail: settings.userEmail },
        data: { plan: "free" },
      });
    }
  }

  return NextResponse.json({ received: true });
}
