import assert from "node:assert/strict";
import test from "node:test";

import { projectBillingEntitlement } from "../lib/lib/entitlementProjection.js";

test("RevenueCat expiration cannot revoke an active Stripe entitlement", () => {
  assert.deepEqual(
    projectBillingEntitlement({
      current: {
        source: "iap",
        pro: true,
        stripe: { pro: true, expiresAt: 3_000 },
      },
      incomingSource: "iap",
      incoming: { pro: false, expiresAt: 1_000 },
      nowMs: 2_000,
    }),
    { pro: true, source: "stripe", expiresAt: 3_000 }
  );
});

test("Stripe cancellation cannot revoke an active RevenueCat entitlement", () => {
  assert.deepEqual(
    projectBillingEntitlement({
      current: {
        source: "stripe",
        pro: true,
        revenueCat: { pro: true, expiresAt: 3_000 },
      },
      incomingSource: "stripe",
      incoming: { pro: false, expiresAt: 1_000 },
      nowMs: 2_000,
    }),
    { pro: true, source: "iap", expiresAt: 3_000 }
  );
});

test("legacy top-level source remains compatible during migration", () => {
  assert.deepEqual(
    projectBillingEntitlement({
      current: { source: "iap", pro: true, expiresAt: 3_000 },
      incomingSource: "stripe",
      incoming: { pro: false, expiresAt: 1_000 },
      nowMs: 2_000,
    }),
    { pro: true, source: "iap", expiresAt: 3_000 }
  );
});
