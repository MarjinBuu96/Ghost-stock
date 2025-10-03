export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";
import { shopifyGraphqlUrl } from "@/lib/shopifyApi";


export async function GET(req) {
  try {
    const url = new URL(req.url);
    const shopParam = url.searchParams.get("shop");
    const store = (await getActiveStore(req)) || (shopParam
      ? await prisma.store.findUnique({ where: { shop: shopParam } })
      : null);

    console.log("🔍 Confirm route store:", store);

    if (!store || !store.userEmail) {
      console.error("❌ Missing store or userEmail:", store);
      return NextResponse.redirect(new URL("/settings?billing=unauthorized", req.url));
    }




    
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

    
    const resp = await fetch(shopifyGraphqlUrl(store.shop), {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const json = await resp.json().catch(() => ({}));
    const subs = json?.data?.currentAppInstallation?.activeSubscriptions || [];
    console.log("📦 Active subscriptions:", subs);

    let newPlan = null;
    const names = subs.map((s) => (s?.name || "").toLowerCase());
    if (names.some((n) => n.includes("enterprise"))) newPlan = "enterprise";
    else if (names.some((n) => n.includes("pro"))) newPlan = "pro";
    else if (names.some((n) => n.includes("starter"))) newPlan = "starter";

    if (!newPlan && ["starter", "pro", "enterprise"].includes(hinted)) {
      newPlan = hinted;
    }

    if (newPlan) {
      console.log(`⚙️ Attempting to update plan for ${store.userEmail} → ${newPlan}`);

      try {
        await prisma.userSettings.update({
          where: { userEmail: store.userEmail },
          data: { plan: newPlan },
        });
        console.log("✅ Plan updated successfully");
      } catch (err) {
        console.warn("⚠️ Update failed, trying create:", err);
        await prisma.userSettings.create({
          data: {
            userEmail: store.userEmail,
            currency: store.currency || "GBP",
            plan: newPlan,
          },
        });
        console.log("✅ Plan created successfully");
      }

      return NextResponse.redirect(new URL("/settings?upgraded=1", req.url));
    }

    console.warn("⚠️ No active subscription found");
    return NextResponse.redirect(new URL("/settings?billing=no-active-subscription", req.url));
  } catch (e) {
    console.error("🔥 Billing confirm error:", e);
    return NextResponse.redirect(new URL("/settings?billing=error", req.url));
  }
}
