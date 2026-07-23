import assert from "node:assert/strict";
import test from "node:test";

import {
  REVENUECAT_PRODUCT_IDS,
  revenueCatCreditLedgerId,
  resolveRevenueCatEvent,
  resolveRevenueCatPlan,
} from "../lib/revenuecat/plans.js";

test("RevenueCat credit idempotency keys derive from store transactions", () => {
  const first = revenueCatCreditLedgerId("transaction-1");
  assert.match(first, /^revenuecat:[a-f0-9]{64}$/);
  assert.equal(first, revenueCatCreditLedgerId("transaction-1"));
  assert.notEqual(first, revenueCatCreditLedgerId("transaction-2"));
  assert.equal(revenueCatCreditLedgerId(""), null);
});

test("RevenueCat product allowlist matches the production plans", () => {
  assert.deepEqual(resolveRevenueCatPlan(REVENUECAT_PRODUCT_IDS.monthly), {
    plan: "monthly",
    credits: 3,
    subscription: true,
  });
  assert.deepEqual(resolveRevenueCatPlan(REVENUECAT_PRODUCT_IDS.yearly), {
    plan: "yearly",
    credits: 36,
    subscription: true,
  });
  assert.deepEqual(resolveRevenueCatPlan(REVENUECAT_PRODUCT_IDS.one), {
    plan: "one",
    credits: 1,
    subscription: false,
  });
  assert.equal(resolveRevenueCatPlan("attacker.product"), null);
});

test("RevenueCat subscription purchases grant Pro and credits exactly on purchase events", () => {
  const initial = resolveRevenueCatEvent({
    event: {
      type: "INITIAL_PURCHASE",
      product_id: REVENUECAT_PRODUCT_IDS.monthly,
      entitlement_ids: ["pro"],
      expiration_at_ms: 2_000,
    },
    entitlementId: "pro",
    nowMs: 1_000,
  });
  assert.equal(initial.recognized, true);
  assert.equal(initial.pro, true);
  assert.equal(initial.credits, 3);

  const renewal = resolveRevenueCatEvent({
    event: {
      type: "RENEWAL",
      product_id: REVENUECAT_PRODUCT_IDS.yearly,
      entitlement_ids: ["pro"],
      expiration_at_ms: 2_000,
    },
    entitlementId: "pro",
    nowMs: 1_000,
  });
  assert.equal(renewal.pro, true);
  assert.equal(renewal.credits, 36);

  const cancellation = resolveRevenueCatEvent({
    event: {
      type: "CANCELLATION",
      product_id: REVENUECAT_PRODUCT_IDS.monthly,
      entitlement_ids: ["pro"],
      expiration_at_ms: 2_000,
    },
    entitlementId: "pro",
    nowMs: 1_000,
  });
  assert.equal(cancellation.pro, true);
  assert.equal(cancellation.credits, 0);
});

test("RevenueCat consumables grant credits without granting Pro", () => {
  const purchase = resolveRevenueCatEvent({
    event: {
      type: "NON_RENEWING_PURCHASE",
      product_id: REVENUECAT_PRODUCT_IDS.one,
    },
    entitlementId: "pro",
  });
  assert.equal(purchase.recognized, true);
  assert.equal(purchase.pro, null);
  assert.equal(purchase.credits, 1);

  const unrelated = resolveRevenueCatEvent({
    event: {
      type: "INITIAL_PURCHASE",
      product_id: REVENUECAT_PRODUCT_IDS.one,
    },
    entitlementId: "pro",
  });
  assert.equal(unrelated.pro, null);
  assert.equal(unrelated.credits, 0);
});

test("RevenueCat events fail closed for unknown products and wrong entitlements", () => {
  const unknown = resolveRevenueCatEvent({
    event: {
      type: "INITIAL_PURCHASE",
      product_id: "unknown.product",
      entitlement_ids: ["pro"],
    },
    entitlementId: "pro",
  });
  assert.equal(unknown.recognized, false);
  assert.equal(unknown.credits, 0);
  assert.equal(unknown.pro, null);

  const wrongEntitlement = resolveRevenueCatEvent({
    event: {
      type: "INITIAL_PURCHASE",
      product_id: REVENUECAT_PRODUCT_IDS.monthly,
      entitlement_ids: ["other"],
    },
    entitlementId: "pro",
  });
  assert.equal(wrongEntitlement.recognized, false);
  assert.equal(wrongEntitlement.credits, 0);
});
