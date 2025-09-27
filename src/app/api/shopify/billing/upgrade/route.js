// src/app/api/shopify/billing/upgrade/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { normalizePlan } from "@/lib/entitlements";

/**
 * Minimal Shopify App Subscription creator.
 * Returns { confirmationUrl } for the merchant to approve.
 *
 * Env you can tweak:
 * - SHOPIFY_APP_URL or NEXT_PUBLIC_BASE_URL  -> used for the returnUrl
 * - SHOPIFY_BILLING_TEST=true|false          -> mark the subscription as test (recommended in dev)
 * - SHOPIFY_TRIAL_DAYS=7                     -> optional free trial days
 */
export async function POST(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!store.shop || !store.accessToken) {
      return NextResponse.json({ error: "store_incomplete" }, { status: 400 });
    }

    const { plan: raw } = await req.json().catch(() => ({}));
    const plan = normalizePlan(raw); // "free" | "starter" | "pro" | "enterprise"
    if (!["starter", "pro", "enterprise"].includes(plan)) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    // Simple internal pricing map (monthly). Adjust to your real pricing.
    const PRICING = {
      starter: { name: "Starter", amount: 9 },
      pro: { name: "Pro", amount: 29 },
      enterprise: { name: "Enterprise", amount: 99 },
    };

    const cfg = PRICING[plan];
    if (!cfg) return NextResponse.json({ error: "plan_not_configured" }, { status: 400 });

    const currencyCode = (store.currency || "GBP").toUpperCase(); // you already store currency in settings
    const base =
      process.env.SHOPIFY_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      new URL("/", req.url).toString().replace(/\/$/, "");
    const returnUrl = `${base}/api/shopify/billing/confirm?plan=${encodeURIComponent(plan)}`;

    const test =
      (process.env.SHOPIFY_BILLING_TEST || "").toLowerCase() === "true" ||
      process.env.NODE_ENV !== "production";

    const trialDays = Number(process.env.SHOPIFY_TRIAL_DAYS || 0) || null;

    // GraphQL mutation: appSubscriptionCreate
    const mutation = `
      mutation AppSubCreate($name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int, $amount: MoneyInput!, $interval: AppPricingInterval!, $currency: CurrencyCode!) {
        appSubscriptionCreate(
          name: $name,
          returnUrl: $returnUrl,
          test: $test,
          trialDays: $trialDays,
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                interval: $interval,
                price: { amount: $amount.amount, currencyCode: $currency }
              }
            }
          }]
        ) {
          confirmationUrl
          userErrors { field message }
          appSubscription { id name status }
        }
      }
    `;

    const variables = {
      name: `${cfg.name} Plan`,
      returnUrl,
      test,
      trialDays,
      amount: { amount: String(cfg.amount) },
      interval: "EVERY_30_DAYS",
      currency: currencyCode,
    };

    const resp = await fetch(`https://${store.shop}/admin/api/2025-07/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const json = await resp.json().catch(() => ({}));
    const sub = json?.data?.appSubscriptionCreate;
    const confirmationUrl = sub?.confirmationUrl;
    const err = sub?.userErrors?.[0]?.message;

    if (!resp.ok || !confirmationUrl) {
      return NextResponse.json(
        { error: err || "billing_create_failed", details: json?.errors || json },
        { status: 502 }
      );
    }

    // We don’t set the plan yet; we’ll confirm on returnUrl.
    return NextResponse.json({ confirmationUrl });
  } catch (e) {
    console.error("Billing upgrade error:", e);
    return NextResponse.json({ error: "upgrade_failed", message: String(e?.message || e) }, { status: 500 });
  }
}
