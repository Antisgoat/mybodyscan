/* eslint-disable @typescript-eslint/explicit-function-return-type */
const read = (k: string) => (process.env?.[k] ?? undefined);

export const getHostBaseUrl = () => read("HOST_BASE_URL");
export const getAllowedOrigins = (): string[] => {
  const raw = read("APP_CHECK_ALLOWED_ORIGINS");
  if (!raw) return [];
  return String(raw).split(",").map(s => s.trim()).filter(Boolean);
};
export const getAppCheckEnforceSoft = () => {
  const raw = read("APP_CHECK_ENFORCE_SOFT");
  if (raw === undefined) return true;
  const v = String(raw).toLowerCase();
  return !(v === "false" || v === "0" || v === "no");
};

export const getOpenAIKey = () => read("OPENAI_API_KEY");
export const getStripeSecret = () => read("STRIPE_SECRET");
export const getStripeSigningSecret = () => read("STRIPE_SECRET_KEY");

export const hasOpenAI = () => Boolean(getOpenAIKey());
export const hasStripe = () => Boolean(getStripeSecret() && getStripeSigningSecret());

export function assertStripeConfigured() {
  if (!hasStripe()) throw new Error("stripe_not_configured");
}
