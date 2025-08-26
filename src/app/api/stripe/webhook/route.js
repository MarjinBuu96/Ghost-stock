export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { planFromPriceId, PLAN } from "@/lib/stripePlans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;

        const customerId = sub.customer;
        // Choose the “active” price — first item is fine for 1-seat subs
        const priceId = sub.items?.data?.[0]?.price?.id || null;
        const plan = planFromPriceId(priceId);

        // Prefer linking by stripeCustomerId (already stored), but fall back to email if needed
        let whereByCustomer = await prisma.userSettings.findFirst({
          where: { stripeCustomerId: customerId },
          select: { userEmail: true },
        });

        if (!whereByCustomer) {
          // Try email lookup (if customer has one)
          const customer = await stripe.customers.retrieve(customerId);
          const email = typeof customer === "object" ? customer.email : null;
          if (email) {
            await prisma.userSettings.upsert({
              where: { userEmail: email },
              update: { plan: plan, stripeCustomerId: customerId },
              create: { userEmail: email, plan: plan, stripeCustomerId: customerId },
            });
          }
        } else {
          await prisma.userSettings.update({
            where: { userEmail: whereByCustomer.userEmail },
            data: { plan: plan },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer;

        // Downgrade to starter on cancel/expired
        await prisma.userSettings.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: PLAN.STARTER },
        });
        break;
      }

      // Optional: treat invoice payment_failed as soft lock or warning
      // case "invoice.payment_failed": { /* decide if you want to react */ break; }

      default:
        // No-op for other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook handling error:", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
