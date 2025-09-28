export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store || !store.userEmail) {
      console.error("Missing store or userEmail:", store);
      return NextResponse.redirect(new URL("/settings?billing=unauthorized", req.url));
    }

    const url = new URL(req.url);
    const hinted = (url.searchParams.get("plan") || "").toLowerCase();

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

    let newPlan = null;
    const names = subs.map((s) => (s?.name || "").toLowerCase());
    if (names.some((n) => n.includes("enterprise"))) newPlan = "enterprise";
    else if (names.some((n) => n.includes("pro"))) newPlan = "pro";
    else if (names.some((n) => n.includes("starter"))) newPlan = "starter";

    if (!newPlan && ["starter", "pro", "enterprise"].includes(hinted)) {
      newPlan = hinted;
    }

    if (newPlan) {
      console.log(`Updating plan for ${store.userEmail} → ${newPlan}`);

      try {
        await prisma.userSettings.update({
          where: { userEmail: store.userEmail },
          data: { plan: newPlan },
        });
      } catch (err) {
        console.warn("Update failed, trying create:", err);
        await prisma.userSettings.create({
          data: {
            userEmail: store.userEmail,
            currency: store.currency || "GBP",
            plan: newPlan,
          },
        });
      }

      return NextResponse.redirect(new URL("/settings?upgraded=1", req.url));
    }

    return NextResponse.redirect(new URL("/settings?billing=no-active-subscription", req.url));
  } catch (e) {
    console.error("Billing confirm error:", e);
    return NextResponse.redirect(new URL("/settings?billing=error", req.url));
  }
}
