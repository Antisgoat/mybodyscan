import type Stripe from "stripe";

import { getStripeKey } from "./keys.js";

export class PaymentsDisabledError extends Error {
  code = "payments_disabled" as const;

  constructor(message = "Stripe secret missing") {
    super(message);
    this.name = "PaymentsDisabledError";
  }
}

export function getStripeSecret(): string {
  try {
    return getStripeKey();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "payments_disabled"
    ) {
      throw new PaymentsDisabledError("Stripe secret missing");
    }
    throw error;
  }
}

let cachedStripe: { secret: string; client: Stripe } | null = null;

export async function getStripe(): Promise<Stripe> {
  const secret = getStripeSecret();
  if (cachedStripe && cachedStripe.secret === secret) {
    return cachedStripe.client;
  }

  const stripeModule = await import("stripe");
  const client = new stripeModule.default(secret, { apiVersion: "2024-06-20" });
  cachedStripe = { secret, client };
  return client;
}

export function hasStripeSecret(): boolean {
  try {
    getStripeKey();
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "payments_disabled"
    ) {
      return false;
    }
    throw error;
  }
}
