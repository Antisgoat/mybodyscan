import { logger } from "firebase-functions";

export const env = {
  HOST_BASE_URL: process.env.HOST_BASE_URL ?? "",
  STRIPE_SECRET: process.env.STRIPE_SECRET ?? "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  APP_CHECK_ALLOWED_ORIGINS: process.env.APP_CHECK_ALLOWED_ORIGINS ?? "",
  APP_CHECK_ENFORCE_SOFT:
    String(process.env.APP_CHECK_ENFORCE_SOFT ?? "true").toLowerCase() === "true",
};

export const hasStripe = (): boolean =>
  Boolean(env.STRIPE_SECRET && env.STRIPE_SECRET_KEY);

export const hasHostBase = (): boolean => env.HOST_BASE_URL.length > 0;

export function assertStripeConfigured(): void {
  if (!hasStripe()) {
    const err: any = new Error("Stripe not configured");
    err.code = "failed-precondition";
    throw err;
  }
}

export function getEnvOrDefault(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  return raw;
}

const warnedKeys = new Set<string>();

export function getBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  if (!warnedKeys.has(name)) {
    logger.warn(
      `${name}: unable to parse boolean value (${raw}); falling back to ${fallback}`
    );
    warnedKeys.add(name);
  }

  return fallback;
}
