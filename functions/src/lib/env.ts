// Hardened environment helpers - all env reads go through these functions
// to prevent import-time crashes from undefined values

export const getEnv = (k: string): string | undefined => process.env?.[k];

export const getEnvInt = (k: string, d: number): number => {
  const v = getEnv(k);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

export const getEnvBool = (k: string, d = false): boolean => {
  const v = (getEnv(k) || '').toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return d;
};

export const getHostBaseUrl = () => getEnv("HOST_BASE_URL");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
];

export const getAllowedOrigins = (): string[] => {
  const raw =
    getEnv("ALLOWED_ORIGINS") ||
    getEnv("APP_CHECK_ALLOWED_ORIGINS") ||
    getEnv("FUNCTIONS_ALLOWED_ORIGINS") ||
    "";
  const dynamic = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...dynamic]));
};

export const getAppCheckEnforceSoft = () => getEnvBool("APP_CHECK_ENFORCE_SOFT", true);

export const getOpenAIKey = () => getEnv("OPENAI_API_KEY");

export const getStripeSecret = () =>
  (getEnv("STRIPE_SECRET") || getEnv("STRIPE_API_KEY") || undefined);

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
