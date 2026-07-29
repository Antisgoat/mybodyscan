import assert from "node:assert/strict";
import test from "node:test";

import { getStripeWebhookRequestError } from "../lib/stripeWebhook.js";

test("Stripe webhook reports missing server configuration separately", () => {
  assert.deepEqual(getStripeWebhookRequestError(undefined, ""), {
    status: 501,
    message: "unconfigured",
  });
});

test("Stripe webhook rejects a request without a signature", () => {
  assert.deepEqual(
    getStripeWebhookRequestError(undefined, "whsec_configured"),
    {
      status: 400,
      message: "Missing Stripe signature",
    }
  );
});

test("Stripe webhook accepts a signed request for verification", () => {
  assert.equal(
    getStripeWebhookRequestError(
      "t=123,v1=invalid-but-present",
      "whsec_configured"
    ),
    null
  );
});
