import { STRIPE_PUBLISHABLE_KEY } from "./flags";
import { isNative } from "@/lib/platform";

export function isStripeEnabled(): boolean {
  // Keep Stripe for web, hide on native (iOS/Android) builds.
  if (isNative()) return false;
  return Boolean(STRIPE_PUBLISHABLE_KEY);
}
