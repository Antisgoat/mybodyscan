// Centralized Stripe identifiers and plan metadata.
// Replace placeholder IDs with live values before deploying.
export const PRICES = {
  STARTER: 'price_starter_scan',      // $9.99 one-time, 1 credit
  EXTRA: 'price_extra_scan',         // $9.99 one-time, 1 credit
  PRO_MONTHLY: 'price_pro_monthly',  // $24.99/month subscription
  ELITE_ANNUAL: 'price_elite_annual' // $199/year subscription
} as const;

// Coupon that discounts the first month of PRO_MONTHLY to $14.99.
export const INTRO_COUPON = 'coupon_pro_monthly_intro';

// Scans included each period for the PRO_MONTHLY bundle.
export const PRO_BUNDLE_CREDITS = 3;
