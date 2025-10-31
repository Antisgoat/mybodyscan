import { readSecret } from "../util/env.js";

export function getStripeKey(): { present: boolean; value?: string } {
  return readSecret("STRIPE_SECRET_KEY", ["STRIPE_SECRET"]);
}
