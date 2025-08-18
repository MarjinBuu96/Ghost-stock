export const runtime = "nodejs";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { userEmail: session.user.email } });
  if (!settings?.stripeCustomerId) return NextResponse.json({ error: "no_customer" }, { status: 400 });

  const portal = await stripe.billingPortal.sessions.create({
    customer: settings.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  });

  return NextResponse.json({ url: portal.url });
}
