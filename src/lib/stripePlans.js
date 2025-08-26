// Central place to map Stripe price IDs to your internal plan names

export const PLAN = {
  FREE: "free",          // your schema default
  STARTER: "starter",    // your free/entry tier alias (you can unify FREE/STARTER if you prefer)
  PRO: "pro",
  ENTERPRISE: "enterprise",
};

// Read from env so you don't hardcode price IDs
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]: PLAN.STARTER,
  [process.env.STRIPE_PRICE_PRO]: PLAN.PRO,
  [process.env.STRIPE_PRICE_ENTERPRISE]: PLAN.ENTERPRISE,
};

/**
 * Given a Stripe price ID, return the internal plan name.
 * Fallback: keep users on STARTER (or switch to PLAN.FREE if you prefer).
 */
export function planFromPriceId(priceId) {
  if (!priceId) return PLAN.STARTER;
  return PRICE_TO_PLAN[priceId] || PLAN.STARTER;
}
