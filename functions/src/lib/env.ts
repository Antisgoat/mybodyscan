import { getStripeSecret as resolveStripeSecret, getWebhookSecret, getOpenAiSecret } from "./config.js";

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

export const getAllowedOrigins = (): string[] => {
  const raw = getEnv("APP_CHECK_ALLOWED_ORIGINS");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

export type AppCheckMode = "strict" | "soft" | "disabled";

export const getAppCheckMode = (): AppCheckMode => {
  const raw = (getEnv("APP_CHECK_MODE") || "").trim().toLowerCase();
  if (raw === "strict" || raw === "disabled") {
    return raw;
  }
  return "soft";
};

export const getOpenAIKey = () => getOpenAiSecret() ?? getEnv("OPENAI_API_KEY");

export const getStripeSecret = () => resolveStripeSecret() ?? undefined;

export const getStripeSigningSecret = () => getWebhookSecret() ?? undefined;

export const hasOpenAI = () => Boolean(getOpenAIKey());
export const hasStripe = () => Boolean(resolveStripeSecret() && getWebhookSecret());

export function assertStripeConfigured() {
  if (!hasStripe()) throw new Error("stripe_not_configured");
}
