export const runtime = "nodejs";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { priceId } = await req.json();
  const email = session.user.email;

  // Ensure customer
  let settings = await prisma.userSettings.upsert({
    where: { userEmail: email },
    update: {},
    create: { userEmail: email },
  });

  let customerId = settings.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email });
    settings = await prisma.userSettings.update({
      where: { userEmail: email },
      data: { stripeCustomerId: customer.id },
    });
    customerId = customer.id;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?billing=cancelled`,
  });

  return NextResponse.json({ url: checkout.url });
}
