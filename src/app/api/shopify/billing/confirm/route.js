// src/app/api/shopify/billing/confirm/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";

/**
 * After the merchant approves the subscription, Shopify redirects here.
 * We read the active subscription and update userSettings.plan accordingly.
 */
export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.redirect(new URL("/settings?billing=unauthorized", req.url));

    // Optional: plan hint from query (not fully trusted)
    const url = new URL(req.url);
    const hinted = (url.searchParams.get("plan") || "").toLowerCase();

    // Query current active subscriptions to determine the real plan
    const query = `
      query CurrentSubs {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            lineItems { id }
          }
        }
      }
    `;

    const resp = await fetch(`https://${store.shop}/admin/api/2025-07/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const json = await resp.json().catch(() => ({}));
    const subs = json?.data?.currentAppInstallation?.activeSubscriptions || [];

    // Naive mapping by subscription name
    // (You can store a mapping in DB if you later use appSubscriptionUpdate webhooks.)
    let newPlan = null;
    const names = subs.map((s) => (s?.name || "").toLowerCase());
    if (names.some((n) => n.includes("enterprise"))) newPlan = "enterprise";
    else if (names.some((n) => n.includes("pro"))) newPlan = "pro";
    else if (names.some((n) => n.includes("starter"))) newPlan = "starter";

    // Fallback to hinted plan if no active subs were found (e.g., test mode delays)
    if (!newPlan && ["starter", "pro", "enterprise"].includes(hinted)) {
      newPlan = hinted;
    }

    if (newPlan) {
      await prisma.userSettings.upsert({
        where: { userEmail: store.userEmail },
        update: { plan: newPlan },
        create: {
          userEmail: store.userEmail,
          currency: store.currency || "GBP",
          plan: newPlan,
        },
      });
      return NextResponse.redirect(new URL("/settings?upgraded=1", req.url));
    }

    return NextResponse.redirect(new URL("/settings?billing=no-active-subscription", req.url));
  } catch (e) {
    console.error("Billing confirm error:", e);
    return NextResponse.redirect(new URL("/settings?billing=error", req.url));
  }
}
