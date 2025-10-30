import { STRIPE_PUBLISHABLE_KEY } from "./flags";

export function isStripeEnabled(): boolean {
  return Boolean(STRIPE_PUBLISHABLE_KEY);
}
