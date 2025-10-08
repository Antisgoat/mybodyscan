import { logger } from "firebase-functions";

type EnvCache = Map<string, string>;

const cache: EnvCache = new Map();

function readEnv(name: string): string {
  if (cache.has(name)) {
    return cache.get(name)!;
  }
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  cache.set(name, value);
  return value;
}

export function getHostBaseUrl(): string {
  return readEnv("HOST_BASE_URL");
}

interface StripeCandidate {
  name: string;
  value: string;
}

function getStripeCandidates(): StripeCandidate[] {
  return [
    { name: "STRIPE_SECRET_KEY", value: readEnv("STRIPE_SECRET_KEY") },
    { name: "STRIPE_SECRET", value: readEnv("STRIPE_SECRET") },
  ].filter((entry) => entry.value.length > 0);
}

export function getStripeSecretNames(): string[] {
  return getStripeCandidates().map((entry) => entry.name);
}

export function getStripeSecret(): string {
  const [primary] = getStripeCandidates();
  return primary ? primary.value : "";
}

export function hasStripe(): boolean {
  return getStripeSecret().length > 0;
}

export function hasHostBase(): boolean {
  return getHostBaseUrl().length > 0;
}

export function assertStripeConfigured(): void {
  if (!hasStripe()) {
    const err: any = new Error("Stripe not configured");
    err.code = "failed-precondition";
    throw err;
  }
}

export function getEnvOrDefault(name: string, fallback: string): string {
  const raw = readEnv(name);
  return raw === "" ? fallback : raw;
}

const warnedKeys = new Set<string>();

export function getBool(name: string, fallback: boolean): boolean {
  const raw = readEnv(name);
  if (raw === "") {
    return fallback;
  }
  const normalized = raw.toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  if (!warnedKeys.has(name)) {
    logger.warn(`${name}: unable to parse boolean value (${raw}); falling back to ${fallback}`);
    warnedKeys.add(name);
  }
  return fallback;
}

export function getAppCheckAllowedOrigins(): string[] {
  const raw = readEnv("APP_CHECK_ALLOWED_ORIGINS");
  if (raw === "") {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function isAppCheckSoftEnforced(): boolean {
  return getBool("APP_CHECK_ENFORCE_SOFT", true);
}
