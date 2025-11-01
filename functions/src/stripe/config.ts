import { readSecret } from "../util/env.js";

export class PaymentsDisabledError extends Error {
  code = "payments_disabled" as const;

  constructor(message = "Stripe secret missing") {
    super(message);
    this.name = "PaymentsDisabledError";
  }
}

export function getStripeSecret(): string {
  const secret = readSecret("STRIPE_SECRET_KEY", ["STRIPE_SECRET"]);
  if (secret.present && typeof secret.value === "string" && secret.value.trim()) {
    return secret.value.trim();
  }

  const envFallback = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || "").trim();
  if (envFallback) {
    return envFallback;
  }

  throw new PaymentsDisabledError();
}

export function hasStripeSecret(): boolean {
  try {
    return Boolean(getStripeSecret());
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "payments_disabled") {
      return false;
    }
    throw error;
  }
}
