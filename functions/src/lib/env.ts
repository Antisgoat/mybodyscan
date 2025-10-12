 
const read = (k: string) => process.env?.[k] ?? undefined;

// NOTE: Firebase Secret Manager injects values into process.env at runtime in Functions.
// TODO: remove any inline keys once verified on prod; environment wins over inline defaults.

export const getEnv = (key: string): string | undefined => {
  const raw = read(key);
  if (raw === undefined) return undefined;
  return String(raw);
};

export const getEnvInt = (k: string, d: number): number => {
  const v = getEnv(k);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

export const getEnvBool = (k: string, d = false): boolean => {
  const v = (getEnv(k) || "").toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return d;
};

export const getHostBaseUrl = () => getEnv("HOST_BASE_URL");
export const getAllowedOrigins = (): string[] => {
  const raw = getEnv("APP_CHECK_ALLOWED_ORIGINS");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};
export const getAppCheckEnforceSoft = () => {
  const raw = getEnv("APP_CHECK_ENFORCE_SOFT");
  if (raw === undefined) return true;
  const v = raw.toLowerCase();
  return !(v === "false" || v === "0" || v === "no");
};

export const getOpenAIKey = () => getEnv("OPENAI_API_KEY");
export const getStripeSecret = () =>
  // Support both STRIPE_SECRET and legacy STRIPE_SECRET_KEY for API key if present
  (getEnv("STRIPE_SECRET") || getEnv("STRIPE_API_KEY") || undefined);
// Webhook signing secret from Stripe dashboard (support common env names)
export const getStripeSigningSecret = () =>
  (
    getEnv("STRIPE_WEBHOOK_SECRET") ||
    getEnv("STRIPE_SIGNING_SECRET") ||
    getEnv("STRIPE_SIGNATURE") ||
    getEnv("STRIPE_SECRET_KEY") ||
    undefined
  );

export const hasOpenAI = () => Boolean(getOpenAIKey());
export const hasStripe = () => Boolean(getStripeSecret() && getStripeSigningSecret());

export function assertStripeConfigured() {
  if (!hasStripe()) throw new Error("stripe_not_configured");
}
