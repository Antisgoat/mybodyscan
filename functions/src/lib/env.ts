/* eslint-disable @typescript-eslint/explicit-function-return-type */
const read = (k: string) => (process.env?.[k] ?? undefined);

// NOTE: Firebase Secret Manager injects values into process.env at runtime in Functions.
// TODO: remove any inline keys once verified on prod; environment wins over inline defaults.

export const getHostBaseUrl = () => read("HOST_BASE_URL");
export const getAllowedOrigins = (): string[] => {
  const raw = read("APP_CHECK_ALLOWED_ORIGINS");
  if (!raw) return [];
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
};
export const getAppCheckEnforceSoft = () => {
  const raw = read("APP_CHECK_ENFORCE_SOFT");
  if (raw === undefined) return true;
  const v = String(raw).toLowerCase();
  return !(v === "false" || v === "0" || v === "no");
};

export const getOpenAIKey = () => read("OPENAI_API_KEY");
export const getStripeSecret = () =>
  // Support both STRIPE_SECRET and legacy STRIPE_SECRET_KEY for API key if present
  (read("STRIPE_SECRET") || read("STRIPE_API_KEY") || undefined);
// Webhook signing secret from Stripe dashboard (support common env names)
export const getStripeSigningSecret = () =>
  (read("STRIPE_WEBHOOK_SECRET") || read("STRIPE_SIGNING_SECRET") || read("STRIPE_SIGNATURE") || read("STRIPE_SECRET_KEY") || undefined);

export const hasOpenAI = () => Boolean(getOpenAIKey());
export const hasStripe = () => Boolean(getStripeSecret() && getStripeSigningSecret());

export function assertStripeConfigured() {
  if (!hasStripe()) throw new Error("stripe_not_configured");
}
