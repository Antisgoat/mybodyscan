import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CREDIT_EXPIRY_MONTHS,
  getCreditExpiryMonths,
} from "../lib/lib/creditPolicy.js";

test("credit expiry defaults to the public 12-month policy", () => {
  assert.equal(DEFAULT_CREDIT_EXPIRY_MONTHS, 12);
  assert.equal(getCreditExpiryMonths(undefined), 12);
  assert.equal(getCreditExpiryMonths(""), 12);
  assert.equal(getCreditExpiryMonths("invalid"), 12);
  assert.equal(getCreditExpiryMonths("-3"), 12);
});

test("credit expiry accepts a positive whole-month override", () => {
  assert.equal(getCreditExpiryMonths("18"), 18);
  assert.equal(getCreditExpiryMonths("6.9"), 6);
});
