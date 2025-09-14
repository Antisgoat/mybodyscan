// Stripe price identifiers for production plans.
// Replace placeholder strings with the live price IDs from Stripe.
export const PRICES = {
  EXTRA: "price_extra_scan", // $9.99 one‑time purchase
  STARTER: "price_starter_plan", // $14.99/month subscription
  TRIAL: "price_first_month_trial", // $24.99 for the first month then STARTER
  ANNUAL: "price_annual_plan", // $69.99/year subscription
} as const;

// Credits granted for each plan or purchase.
export const PLAN_CREDITS: Record<keyof typeof PRICES, number> = {
  EXTRA: 1,
  STARTER: 3,
  TRIAL: 3,
  ANNUAL: 36,
};
