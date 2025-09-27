// src/lib/shopifyBilling.js
export const BILLING = {
  plans: {
    starter: { amount: 9,  currencyCode: "GBP", trialDays: 7, features: ["Manual scan", "KPIs", "CSV"] },
    pro:     { amount: 39, currencyCode: "GBP", trialDays: 7, features: ["Auto-scan", "Slack", "Multi-location"] },
    enterprise: { amount: 199, currencyCode: "GBP", trialDays: 7, features: ["Rules", "Audit", "SLA"] },
  },
};

async function gql(shop, token, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/2025-07/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Shopify GraphQL error: ${res.status} ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

export async function getActiveSubscriptions(shop, token) {
  const q = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          createdAt
          lineItems { id plan { pricingDetails { __typename ... on AppRecurringPricing { price { amount currencyCode } } } } }
        }
      }
    }
  `;
  const data = await gql(shop, token, q);
  return data?.currentAppInstallation?.activeSubscriptions || [];
}

export async function createOrConfirmSubscription({ shop, token, plan, returnUrl }) {
  const p = BILLING.plans[plan];
  if (!p) throw new Error(`Unknown plan: ${plan}`);

  // Is something already active?
  const active = await getActiveSubscriptions(shop, token);
  if (active?.length) {
    // already subscribed—just send them back
    return { alreadyActive: true, confirmationUrl: returnUrl };
  }

  const m = `
    mutation appSubscriptionCreate($name:String!, $returnUrl:URL!, $trialDays:Int!, $amount:Decimal!, $currencyCode:CurrencyCode!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: $amount, currencyCode: $currencyCode }
            }
          }
        }]
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id name status }
      }
    }
  `;
  const vars = {
    name: `Ghost Stock Killer – ${plan}`,
    returnUrl,
    trialDays: p.trialDays ?? 0,
    amount: p.amount,
    currencyCode: p.currencyCode,
  };

  const data = await gql(shop, token, m, vars);
  const errs = data?.appSubscriptionCreate?.userErrors;
  if (errs && errs.length) throw new Error(`Billing userErrors: ${JSON.stringify(errs)}`);
  const confirmationUrl = data?.appSubscriptionCreate?.confirmationUrl;
  if (!confirmationUrl) throw new Error("No confirmationUrl from Shopify");
  return { alreadyActive: false, confirmationUrl };
}
