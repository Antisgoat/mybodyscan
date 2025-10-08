import { config as loadFunctionsConfig, logger } from "firebase-functions";

type ConfigShape = Record<string, any> | null;

let cachedConfig: ConfigShape | undefined;

function getConfig(): ConfigShape {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }
  try {
    cachedConfig = loadFunctionsConfig?.() ?? null;
  } catch (error) {
    logger.debug?.("env_config_unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    cachedConfig = null;
  }
  return cachedConfig;
}

function readConfigValue(name: string): string | undefined {
  const config = getConfig();
  if (!config) {
    return undefined;
  }
  const segments = name
    .toLowerCase()
    .split("_")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return undefined;
  }
  let current: any = config;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }
  if (typeof current === "string" && current.trim()) {
    return current.trim();
  }
  return undefined;
}

function readEnvValue(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return undefined;
}

function readValue(name: string, fallbacks: string[] = []): string | undefined {
  const candidates = [name, ...fallbacks];
  for (const candidate of candidates) {
    const envValue = readEnvValue(candidate);
    if (envValue) {
      return envValue;
    }
  }
  for (const candidate of candidates) {
    const configValue = readConfigValue(candidate);
    if (configValue) {
      return configValue;
    }
  }
  return undefined;
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  logger.warn?.("env_boolean_parse_failed", { raw, defaultValue });
  return defaultValue;
}

export function getHostBaseUrl(): string | undefined {
  return readValue("HOST_BASE_URL");
}

export function getAllowedOrigins(): string[] | undefined {
  const raw = readValue("APP_CHECK_ALLOWED_ORIGINS");
  if (!raw) {
    return undefined;
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getAppCheckEnforceSoft(): boolean {
  const raw = readValue("APP_CHECK_ENFORCE_SOFT");
  return parseBoolean(raw, true);
}

export function getOpenAIKey(): string | undefined {
  return readValue("OPENAI_API_KEY");
}

export function getStripeSecret(): string | undefined {
  return readValue("STRIPE_SECRET", ["STRIPE_SECRET_KEY"]);
}

export function getStripeSigningSecret(): string | undefined {
  return readValue("STRIPE_SIGNING_SECRET", ["STRIPE_WEBHOOK", "STRIPE_WEBHOOK_SECRET"]);
}

export function hasOpenAI(): boolean {
  return Boolean(getOpenAIKey());
}

export function hasStripe(): boolean {
  return Boolean(getStripeSecret() && getStripeSigningSecret());
}

export function assertStripeConfigured(): void {
  const secret = getStripeSecret();
  const signingSecret = getStripeSigningSecret();
  if (secret && signingSecret) {
    return;
  }
  const missing: string[] = [];
  if (!secret) {
    missing.push("STRIPE_SECRET");
  }
  if (!signingSecret) {
    missing.push("STRIPE_SIGNING_SECRET");
  }
  const error: Error & { code?: string } = new Error(
    `Stripe configuration missing: ${missing.join(", ")}`
  );
  error.code = "failed-precondition";
  throw error;
}
