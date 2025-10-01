// src/app/api/shopify/billing/upgrade/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getActiveSubscriptions } from "@/lib/shopifyBilling";

const API_VERSION = "2025-07";

/** Decode admin host param to shop domain */
function shopFromHostParam(hostB64) {
  if (!hostB64) return null;
  try {
    const decoded = Buffer.from(hostB64, "base64").toString("utf8");
    const m = decoded.match(/\/store[s]?\/([^/?#]+)/i);
    return m ? `${m[1]}.myshopify.com`.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Pull shop from cookie/header/host param */
function getShopFromRequest(req) {
  try {
    const c = cookies();
    const cookieShop = c.get("shopify_shop")?.value;
    if (cookieShop) return String(cookieShop).toLowerCase();
  } catch {}
  try {
    const h = nextHeaders();
    const hdrShop = h.get("x-shopify-shop-domain");
    if (hdrShop) return String(hdrShop).toLowerCase();
  } catch {}
  try {
    const url = new URL(req.url);
    const fromHost = shopFromHostParam(url.searchParams.get("host"));
    if (fromHost) return fromHost;
  } catch {}
  return null;
}

/** Price + label + trial per plan */
function planToPricing(plan) {
  const test = (v, d) => (v === undefined || v === null || v === "" ? d : v);

  switch (String(plan || "").toLowerCase()) {
    case "starter":
      return {
        name: "Ghost Stock Starter (Monthly)",
        amount: Number(test(process.env.STARTER_PRICE_GBP, "9.99")),
        currencyCode: "GBP",
        trialDays: Number(test(process.env.STARTER_TRIAL_DAYS, "7")),
      };
    case "pro":
      return {
        name: "Ghost Stock Pro (Monthly)",
        amount: Number(test(process.env.PRO_PRICE_GBP, "29")),
        currencyCode: "GBP",
        trialDays: Number(test(process.env.PRO_TRIAL_DAYS, "0")),
      };
    case "enterprise":
      return {
        name: "Ghost Stock Enterprise (Monthly)",
        amount: Number(test(process.env.ENTERPRISE_PRICE_GBP, "199")),
        currencyCode: "GBP",
        trialDays: Number(test(process.env.ENTERPRISE_TRIAL_DAYS, "0")),
      };
    default:
      return null;
  }
}

async function shopifyGraphQL(shop, accessToken, query, variables) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: resp.ok, status: resp.status, json };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = body?.plan;
    if (!plan) return NextResponse.json({ error: "missing_plan" }, { status: 400 });

    const shop = getShopFromRequest(req);
    if (!shop) return NextResponse.json({ error: "no_shop_in_request" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { shop } });
    if (!store?.accessToken || !store?.userEmail) {
      return NextResponse.json({ error: "no_store_or_token", shop }, { status: 400 });
    }

    const url = new URL(req.url);
    const origin = url.origin;
    const host = url.searchParams.get("host") || "";
    const returnUrl = `${origin}/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&upgraded=1`;

    // Figure out pricing for requested plan (Starter is now paid)
    const pricing = planToPricing(plan);
    if (!pricing) return NextResponse.json({ error: "unknown_plan" }, { status: 400 });

    // Check current subs
    const activeSubs = await getActiveSubscriptions(shop, store.accessToken);
    const active = activeSubs?.find(s => String(s.status).toUpperCase() === "ACTIVE") || null;

    // If already on the same (by name match), don't recreate—just bounce back.
    if (active && active.name && active.name.toLowerCase().includes(plan.toLowerCase())) {
      console.log("ℹ️ Subscription already active for target plan:", active.name);
      return NextResponse.json({ confirmationUrl: returnUrl });
    }

    // Cancel any existing active subs first (switching plan)
    if (active) {
      const cancelMutation = `
        mutation CancelSubscription($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription { id status }
            userErrors { field message }
          }
        }
      `;
      const { ok, status, json } = await shopifyGraphQL(
        shop,
        store.accessToken,
        cancelMutation,
        { id: active.id }
      );
      console.log("🧹 Cancel current sub:", status, JSON.stringify(json));
      if (!ok || json?.errors || json?.data?.appSubscriptionCancel?.userErrors?.length) {
        return NextResponse.json(
          { error: "cancel_failed", payload: json },
          { status: 502 }
        );
      }
    }

    // Create new subscription
    const testFlag = String(process.env.SHOPIFY_BILLING_TEST || "").toLowerCase() === "true";
    const createMutation = `
      mutation appSubscriptionCreate(
        $name: String!,
        $lineItems: [AppSubscriptionLineItemInput!]!,
        $returnUrl: URL!,
        $trialDays: Int,
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name,
          lineItems: $lineItems,
          returnUrl: $returnUrl,
          trialDays: $trialDays,
          test: $test
        ) {
          confirmationUrl
          userErrors { field message }
        }
      }
    `;

    const variables = {
      name: pricing.name,
      returnUrl,
      trialDays: pricing.trialDays > 0 ? pricing.trialDays : null,
      test: testFlag,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: pricing.amount, currencyCode: pricing.currencyCode },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    };

    console.log("📤 Create sub →", JSON.stringify(variables, null, 2));
    const { ok, status, json } = await shopifyGraphQL(
      shop,
      store.accessToken,
      createMutation,
      variables
    );
    console.log("📦 Create sub resp:", status, JSON.stringify(json));

    if (!ok) {
      return NextResponse.json(
        { error: "shopify_graphql_http", status, payload: json },
        { status: 502 }
      );
    }
    const result = json?.data?.appSubscriptionCreate;
    if (!result) {
      return NextResponse.json({ error: "missing_subscription_create", payload: json }, { status: 502 });
    }
    if (result.userErrors?.length) {
      return NextResponse.json({ error: "shopify_user_errors", userErrors: result.userErrors }, { status: 400 });
    }
    const confirmationUrl = result.confirmationUrl;
    if (!confirmationUrl) {
      return NextResponse.json({ error: "no_confirmation_url", payload: json }, { status: 500 });
    }

    // Optional: set local plan immediately as intent (final status will be confirmed via webhook/poll)
    try {
      await prisma.userSettings.upsert({
        where: { userEmail: store.userEmail },
        update: { plan: String(plan).toLowerCase() },
        create: {
          userEmail: store.userEmail,
          currency: "GBP",
          plan: String(plan).toLowerCase(),
        },
      });
    } catch (e) {
      console.warn("userSettings upsert failed (non-fatal):", e?.message || e);
    }

    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("🔥 billing/upgrade crash:", err);
    return NextResponse.json({ error: "server_error", message: err?.message || String(err) }, { status: 500 });
  }
}
