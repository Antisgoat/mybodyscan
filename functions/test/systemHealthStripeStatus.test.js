import assert from "node:assert/strict";
import test from "node:test";

import { resolveStripeHealthStatus } from "../lib/systemHealth.js";

test("Stripe health requires both API and webhook secrets for full readiness", () => {
  assert.deepEqual(resolveStripeHealthStatus(true, true), {
    stripeSecretPresent: true,
    stripeApiKeyPresent: true,
    stripeWebhookSecretPresent: true,
    stripeConfigured: true,
  });
});

test("Stripe health does not confuse a webhook secret with an API key", () => {
  assert.deepEqual(resolveStripeHealthStatus(false, true), {
    stripeSecretPresent: false,
    stripeApiKeyPresent: false,
    stripeWebhookSecretPresent: true,
    stripeConfigured: false,
  });
});

test("Stripe health reports a missing webhook secret without disabling checkout", () => {
  assert.deepEqual(resolveStripeHealthStatus(true, false), {
    stripeSecretPresent: true,
    stripeApiKeyPresent: true,
    stripeWebhookSecretPresent: false,
    stripeConfigured: false,
  });
});
