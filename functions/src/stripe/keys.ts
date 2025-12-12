import { defineSecret } from "firebase-functions/params";

export const stripeSecretParam = defineSecret("STRIPE_SECRET");
export const stripeSecretKeyParam = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecretParam = defineSecret("STRIPE_WEBHOOK_SECRET");
export const legacyStripeWebhookParam = defineSecret("STRIPE_WEBHOOK");

function readSecretValue(
  param: ReturnType<typeof defineSecret>
): string | null {
  try {
    const value = param.value();
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch {
    // Secret not available in this environment
  }
  return null;
}

export function getStripeKey(): string {
  const candidates = [
    readSecretValue(stripeSecretParam),
    readSecretValue(stripeSecretKeyParam),
    (process.env.STRIPE_SECRET_KEY || "").trim(),
    (process.env.STRIPE_SECRET || "").trim(),
    (process.env.STRIPE_API_KEY || "").trim(),
    (process.env.STRIPE_KEY || "").trim(),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  throw {
    code: "payments_disabled" as const,
    reason: "missing_stripe_secret" as const,
  };
}

export function getStripeWebhookSecret(): string | null {
  const candidates = [
    readSecretValue(stripeWebhookSecretParam),
    readSecretValue(legacyStripeWebhookParam),
    (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    (process.env.STRIPE_WEBHOOK || "").trim(),
    (process.env.STRIPE_SIGNING_SECRET || "").trim(),
    (process.env.STRIPE_SIGNATURE || "").trim(),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return null;
}
