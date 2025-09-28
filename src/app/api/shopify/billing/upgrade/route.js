export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { prisma } from "@/lib/prisma";

const API_VERSION = "2025-07";

function shopFromHostParam(hostB64) {
  if (!hostB64) return null;
  try {
    const decoded = Buffer.from(hostB64, "base64").toString("utf8");
    const m = decoded.match(/\/store[s]?\/([^/?#]+)/i);
    return m ? `${m[1]}.myshopify.com`.toLowerCase() : null;
  } catch { return null; }
}

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

function planToPricing(plan) {
  switch (String(plan || "").toLowerCase()) {
    case "pro":        return { name: "Ghost Stock Pro",        amount: 29.0,  currencyCode: "USD" };
    case "enterprise": return { name: "Ghost Stock Enterprise", amount: 199.0, currencyCode: "USD" };
    default: return null;
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = body?.plan;
    if (!plan) return NextResponse.json({ error: "missing_plan" }, { status: 400 });

    const shop = getShopFromRequest(req);
    if (!shop) return NextResponse.json({ error: "no_shop_in_request" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { shop } });
    if (!store?.accessToken) {
      return NextResponse.json({ error: "no_store_or_token", shop }, { status: 400 });
    }

    const pricing = planToPricing(plan);
    if (!pricing) return NextResponse.json({ error: "unknown_plan" }, { status: 400 });

    const origin   = new URL(req.url).origin;
    const returnUrl = `${origin}/settings?shop=${encodeURIComponent(shop)}`;
    const testFlag = String(process.env.SHOPIFY_BILLING_TEST || "").toLowerCase() === "true";

    const mutation = `
      mutation appSubscriptionCreate(
        $name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean
      ) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
          confirmationUrl
          userErrors { field message }
        }
      }
    `;

    const variables = {
      name: pricing.name,
      returnUrl,
      test: testFlag,
      lineItems: [{
        plan: {
          appRecurringPricingDetails: {
            price: { amount: pricing.amount, currencyCode: pricing.currencyCode },
            interval: "EVERY_30_DAYS",
          },
        },
      }],
    };

    console.log("📤 Sending to Shopify:", JSON.stringify({ query: mutation, variables }, null, 2)); // ✅ Patch A

    const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": store.accessToken,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const text = await resp.text();
    console.log("📦 Raw Shopify billing response:", text); // ✅ Patch 1

    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!resp.ok) {
      console.error("❌ Shopify HTTP error:", resp.status); // ✅ Patch B
      console.error("🧾 Parsed response:", json);            // ✅ Patch B
      return NextResponse.json(
        { error: "shopify_graphql_http", status: resp.status, payload: json },
        { status: 502 }
      );
    }

    const result = json?.data?.appSubscriptionCreate;
    if (!result) {
      console.error("❌ Missing appSubscriptionCreate:", json); // ✅ Patch 2
      return NextResponse.json({ error: "missing_subscription_create", payload: json }, { status: 502 });
    }

    const userErrors = result?.userErrors || [];
    if (userErrors.length) {
      return NextResponse.json({ error: "shopify_user_errors", userErrors }, { status: 400 });
    }

    const confirmationUrl = result?.confirmationUrl;
    console.log("✅ Confirmation URL:", confirmationUrl); // ✅ Patch 3

    if (!confirmationUrl) {
      return NextResponse.json({ error: "no_confirmation_url", payload: json }, { status: 500 });
    }

    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("billing/upgrade crash:", err);
    return NextResponse.json({ error: "server_error", message: err?.message || String(err) }, { status: 500 });
  }
}
