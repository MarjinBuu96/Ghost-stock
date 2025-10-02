// src/app/api/shopify/billing/upgrade/route.js
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getActiveSubscriptions } from "@/lib/shopifyBilling";

const API_VERSION = "2025-07";
const ALLOWED_PLANS = ["starter", "starter_annual", "pro", "pro_annual"];

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

/** Helpers */
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number(d);
};

/**
 * Determine if this store qualifies for the "first N installs" grandfather price.
 * Priority:
 *  1) Respect explicit boolean flags on the record if they exist (store.grandfathered).
 *  2) Otherwise, compute rank by createdAt among stores considered "installed".
 *
 * NOTE: accessToken is a required String in your schema, so Prisma rejects `{ not: null }`.
 * We treat "installed" as accessToken !== "" when available.
 */
async function isGrandfathered(store) {
  if (typeof store?.grandfathered === "boolean") return store.grandfathered;

  const limit = num(process.env.STARTER_GRANDFATHER_LIMIT, 20);
  if (!store?.createdAt) return false;

  const where = { createdAt: { lte: store.createdAt } };
  // guard: only add a non-empty check if field exists and is string
  if (typeof store?.accessToken === "string") {
    where.accessToken = { not: "" };
  }

  const earlierOrEqual = await prisma.store.count({ where });
  const eligible = earlierOrEqual <= limit;

  // Best-effort persist so we won't recompute next time
  try {
    await prisma.store.update({
      where: { shop: store.shop },
      data: { grandfathered: eligible },
    });
  } catch (e) {
    console.warn("grandfathered persist failed (non-fatal):", e?.message || e);
  }

  return eligible;
}

/** Price + label + trial per plan key */
function planToPricing(planKey, { grandfathered } = {}) {
  const k = String(planKey || "").toLowerCase();

  // Monthly baselines (env overridable)
  const STARTER_MONTHLY = num(process.env.STARTER_PRICE_GBP, 14.99);
  const STARTER_TRIAL = num(process.env.STARTER_TRIAL_DAYS, 14);
  const PRO_MONTHLY = num(process.env.PRO_PRICE_GBP, 29);

  // Annual = 10× monthly (2 months free)
  const STARTER_ANNUAL = +(STARTER_MONTHLY * 10).toFixed(2);
  const PRO_ANNUAL = +(PRO_MONTHLY * 10).toFixed(2);

  // Grandfather special for starter monthly only
  const STARTER_GF_MONTHLY = num(process.env.STARTER_GF_PRICE_GBP, 9.99);

  switch (k) {
    case "starter":
      return {
        name: `Ghost Stock Starter (Monthly${grandfathered ? " – Grandfathered" : ""})`,
        amount: grandfathered ? STARTER_GF_MONTHLY : STARTER_MONTHLY,
        currencyCode: "GBP",
        trialDays: STARTER_TRIAL,
        interval: "EVERY_30_DAYS",
      };
    case "starter_annual":
      return {
        name: "Ghost Stock Starter (Annual, 2 months free)",
        amount: STARTER_ANNUAL,
        currencyCode: "GBP",
        trialDays: STARTER_TRIAL,
        interval: "ANNUAL",
      };
    case "pro":
      return {
        name: "Ghost Stock Pro (Monthly)",
        amount: PRO_MONTHLY,
        currencyCode: "GBP",
        trialDays: 0,
        interval: "EVERY_30_DAYS",
      };
    case "pro_annual":
      return {
        name: "Ghost Stock Pro (Annual, 2 months free)",
        amount: PRO_ANNUAL,
        currencyCode: "GBP",
        trialDays: 0,
        interval: "ANNUAL",
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
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase(); // "starter", "starter_annual", "pro", "pro_annual"
    if (!plan) return NextResponse.json({ error: "missing_plan" }, { status: 400 });
    if (!ALLOWED_PLANS.includes(plan)) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    const shop = getShopFromRequest(req);
    if (!shop) return NextResponse.json({ error: "no_shop_in_request" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { shop } });
    if (!store?.accessToken || !store?.userEmail) {
      return NextResponse.json({ error: "no_store_or_token", shop }, { status: 400 });
    }

    // Grandfather eligibility
    const grandfathered = await isGrandfathered(store);

    // Build pricing
    const pricing = planToPricing(plan, { grandfathered });
    if (!pricing) return NextResponse.json({ error: "unknown_plan" }, { status: 400 });

    // Return URL
    const url = new URL(req.url);
    const origin = url.origin;
    const host = url.searchParams.get("host") || "";
    const returnUrl = `${origin}/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&upgraded=1`;

    // Current subs
    const activeSubs = await getActiveSubscriptions(shop, store.accessToken);
    const active =
      activeSubs?.find((s) => String(s.status).toUpperCase() === "ACTIVE") || null;

    // If already on EXACT same plan name, bounce (lets Monthly <-> Annual switch proceed)
    if (
      active &&
      active.name &&
      active.name.toLowerCase() === String(pricing.name).toLowerCase()
    ) {
      console.log("ℹ️ Subscription already active for target plan:", active.name);
      return NextResponse.json({ confirmationUrl: returnUrl });
    }

    // Cancel existing active when switching plan
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
        return NextResponse.json({ error: "cancel_failed", payload: json }, { status: 502 });
      }
    }

    // Create new subscription
    const testFlag =
      String(process.env.SHOPIFY_BILLING_TEST || "").toLowerCase() === "true";
    const createMutation = `
      mutation appSubscriptionCreate(
        $name: String!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $returnUrl: URL!
        $trialDays: Int
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          trialDays: $trialDays
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
              interval: pricing.interval, // "EVERY_30_DAYS" or "ANNUAL"
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
      return NextResponse.json(
        { error: "missing_subscription_create", payload: json },
        { status: 502 }
      );
    }
    if (result.userErrors?.length) {
      return NextResponse.json(
        { error: "shopify_user_errors", userErrors: result.userErrors },
        { status: 400 }
      );
    }

    const confirmationUrl = result.confirmationUrl;
    if (!confirmationUrl) {
      return NextResponse.json(
        { error: "no_confirmation_url", payload: json },
        { status: 500 }
      );
    }

    // Persist user's intent (non-fatal if it fails)
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
      if (typeof store?.grandfathered === "boolean") {
        if (store.grandfathered !== grandfathered) {
          await prisma.store.update({ where: { shop }, data: { grandfathered } });
        }
      }
    } catch (e) {
      console.warn(
        "userSettings/store upsert failed (non-fatal):",
        e?.message || e
      );
    }

    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("🔥 billing/upgrade crash:", err);
    return NextResponse.json(
      { error: "server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
