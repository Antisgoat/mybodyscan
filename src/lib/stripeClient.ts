import { STRIPE_PUBLISHABLE_KEY } from "./flags";
import { isIOSBuild } from "@/lib/iosBuild";

export function isStripeEnabled(): boolean {
  if (isIOSBuild()) return false;
  return Boolean(STRIPE_PUBLISHABLE_KEY);
}
