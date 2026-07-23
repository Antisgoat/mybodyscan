import { getOpenAIKey, openAiSecretParam } from "../openai/keys.js";
import {
  getStripeKey,
  getStripeWebhookSecret as readStripeWebhookSecret,
  legacyStripeWebhookParam,
  stripeSecretKeyParam,
  stripeSecretParam,
  stripeWebhookSecretParam,
} from "../stripe/keys.js";

const DEFAULT_PRICE_MAP: Record<string, string> = {
  single: "price_1TwQ1OQQU5vuhlNj5peGUJbZ",
  one: "price_1TwQ1OQQU5vuhlNj5peGUJbZ",
  single_legacy: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  pack3: "price_1RuOr2QQU5vuhlNjcqTckCHL",
  pack5: "price_1RuOrkQQU5vuhlNj15ebWfNP",
  monthly: "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  annual: "price_1RuOw0QQU5vuhlNjA5NZ66qq",
  extra: "price_1TwPx2QQU5vuhlNjJFboU9DZ",
  extra_legacy: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  pro_monthly: "price_1TwPxXQQU5vuhlNj9ybv7iLZ",
  pro_monthly_legacy: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  elite_annual: "price_1TwPyFQQU5vuhlNjyCq1Nt1y",
  // Keep superseded prices recognizable for delayed pre-cutover webhook events.
  elite_annual_legacy: "price_1Tw39XQQU5vuhlNjCRpZkL6a",
  elite_annual_legacy_monthly: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
};

const SUBSCRIPTION_PLAN_KEYS = new Set([
  "monthly",
  "annual",
  "pro_monthly",
  "pro_monthly_legacy",
  "elite_annual",
  "elite_annual_legacy",
  "elite_annual_legacy_monthly",
]);

function firstNonEmpty(
  values: Array<string | null | undefined>
): string | null {
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

export function getStripeSecret(): string | null {
  try {
    return getStripeKey();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "payments_disabled"
    ) {
      return null;
    }
    throw error;
  }
}

export function getWebhookSecret(): string | null {
  const secret = readStripeWebhookSecret();
  if (secret) {
    return secret;
  }

  return null;
}

export function getOpenAiSecret(): string | null {
  try {
    return getOpenAIKey();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "openai_missing_key"
    ) {
      return null;
    }
    throw error;
  }
}

export function getAppOrigin(): string | null {
  const envOrigin = firstNonEmpty([
    process.env.APP_ORIGIN,
    process.env.HOST_BASE_URL,
  ]);
  if (envOrigin) {
    return envOrigin;
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

export {
  legacyStripeWebhookParam,
  openAiSecretParam,
  stripeSecretKeyParam,
  stripeSecretParam,
  stripeWebhookSecretParam,
};

export function __resetConfigForTest(): void {
  // Configuration is now sourced from Secret Manager, environment variables,
  // and committed non-secret defaults. Kept as a no-op for test compatibility.
}
