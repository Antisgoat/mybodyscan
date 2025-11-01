import { config as firebaseConfig } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

type RuntimeConfig = Record<string, any>;

type SecretHandle = ReturnType<typeof defineSecret>;

const stripeSecretParam = defineSecret("STRIPE_SECRET");
const stripeWebhookSecretParam = defineSecret("STRIPE_WEBHOOK");
const openAiSecretParam = defineSecret("OPENAI_API_KEY");

let cachedRuntimeConfig: RuntimeConfig | null | undefined;
let runtimeConfigOverride: RuntimeConfig | null | undefined;

const DEFAULT_PRICE_MAP: Record<string, string> = {
  single: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  one: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  pack3: "price_1RuOr2QQU5vuhlNjcqTckCHL",
  pack5: "price_1RuOrkQQU5vuhlNj15ebWfNP",
  monthly: "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  annual: "price_1RuOw0QQU5vuhlNjA5NZ66qq",
  extra: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  pro_monthly: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  elite_annual: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
};

const SUBSCRIPTION_PLAN_KEYS = new Set(["monthly", "annual", "pro_monthly", "elite_annual"]);

function getRuntimeConfig(): RuntimeConfig {
  if (runtimeConfigOverride !== undefined) {
    return runtimeConfigOverride ?? {};
  }
  if (cachedRuntimeConfig !== undefined) {
    return cachedRuntimeConfig ?? {};
  }
  try {
    cachedRuntimeConfig = firebaseConfig();
  } catch {
    cachedRuntimeConfig = {};
  }
  return cachedRuntimeConfig ?? {};
}

function readRuntimeConfig(path: string[]): string | null {
  const cfg = getRuntimeConfig();
  let current: any = cfg;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = current[segment];
  }
  if (typeof current === "string") {
    const trimmed = current.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function readSecret(secret: SecretHandle): string | null {
  try {
    const value = secret.value();
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
  } catch {
    // secret not available in this execution context
  }
  return null;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function collectEnvPrices(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || typeof value !== "string") continue;
    if (!key.startsWith("STRIPE_PRICE_")) continue;
    const normalizedKey = key.substring("STRIPE_PRICE_".length).toLowerCase();
    const trimmed = value.trim();
    if (!trimmed) continue;
    entries[normalizedKey] = trimmed;
  }
  return entries;
}

function collectConfigPrices(): Record<string, string> {
  const result: Record<string, string> = {};
  const cfg = getRuntimeConfig();
  const prices = cfg?.stripe?.prices;
  if (!prices || typeof prices !== "object") {
    return result;
  }
  for (const [key, value] of Object.entries(prices)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[key.toLowerCase()] = trimmed;
  }
  return result;
}

export function getStripeSecret(): string | null {
  const secret = readSecret(stripeSecretParam);
  if (secret) {
    return secret;
  }

  const envSecret = firstNonEmpty([
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_SECRET,
    process.env.STRIPE_API_KEY,
    process.env.STRIPE_KEY,
  ]);
  if (envSecret) {
    return envSecret;
  }

  const configSecret = readRuntimeConfig(["stripe", "secret"]);
  if (configSecret) {
    return configSecret;
  }

  return null;
}

export function getWebhookSecret(): string | null {
  const secret = readSecret(stripeWebhookSecretParam);
  if (secret) {
    return secret;
  }

  const envSecret = firstNonEmpty([
    process.env.STRIPE_WEBHOOK,
    process.env.STRIPE_SIGNING_SECRET,
    process.env.STRIPE_SIGNATURE,
  ]);
  if (envSecret) {
    return envSecret;
  }

  const configSecret = readRuntimeConfig(["stripe", "webhook_secret"]);
  if (configSecret) {
    return configSecret;
  }

  return null;
}

export function getOpenAiSecret(): string | null {
  const secret = readSecret(openAiSecretParam);
  if (secret) {
    return secret;
  }

  const envSecret = firstNonEmpty([
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_KEY,
  ]);
  if (envSecret) {
    return envSecret;
  }

  const configSecret = readRuntimeConfig(["openai", "api_key"]);
  if (configSecret) {
    return configSecret;
  }

  return null;
}

export function getAppOrigin(): string | null {
  const envOrigin = firstNonEmpty([
    process.env.APP_ORIGIN,
    process.env.HOST_BASE_URL,
  ]);
  if (envOrigin) {
    return envOrigin;
  }

  const configOrigin = readRuntimeConfig(["app", "origin"]);
  if (configOrigin) {
    return configOrigin;
  }

  return null;
}

export type PriceAllowlist = {
  allowlist: Set<string>;
  planToPrice: Record<string, string>;
  subscriptionPriceIds: Set<string>;
};

export function getPriceAllowlist(): PriceAllowlist {
  const allowlist = new Set<string>();
  const planToPrice: Record<string, string> = { ...DEFAULT_PRICE_MAP };

  const configPrices = collectConfigPrices();
  for (const [key, value] of Object.entries(configPrices)) {
    planToPrice[key] = value;
  }

  const envPrices = collectEnvPrices();
  for (const [key, value] of Object.entries(envPrices)) {
    planToPrice[key] = value;
  }

  for (const value of Object.values(planToPrice)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    allowlist.add(trimmed);
  }

  const subscriptionPriceIds = new Set<string>();
  for (const [plan, value] of Object.entries(planToPrice)) {
    if (!SUBSCRIPTION_PLAN_KEYS.has(plan)) continue;
    if (!value) continue;
    subscriptionPriceIds.add(value);
  }

  return { allowlist, planToPrice, subscriptionPriceIds };
}

export { stripeSecretParam, stripeWebhookSecretParam, openAiSecretParam };

export function __setRuntimeConfigForTest(config: RuntimeConfig | null): void {
  runtimeConfigOverride = config ?? {};
  cachedRuntimeConfig = undefined;
}

export function __resetConfigForTest(): void {
  runtimeConfigOverride = undefined;
  cachedRuntimeConfig = undefined;
}
