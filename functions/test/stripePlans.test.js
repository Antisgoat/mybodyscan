import assert from "node:assert/strict";
import test from "node:test";

import { resolveStripePlan } from "../lib/stripe/plans.js";

test("Stripe plan allowlist resolves every production plan family", () => {
  assert.deepEqual(resolveStripePlan("price_1RuOpKQQU5vuhlNjipfFBsR0"), {
    plan: "one",
    credits: 1,
    mode: "payment",
  });
  assert.deepEqual(resolveStripePlan("price_1RuOr2QQU5vuhlNjcqTckCHL"), {
    plan: "pack3",
    credits: 3,
    mode: "payment",
  });
  assert.deepEqual(resolveStripePlan("price_1RuOrkQQU5vuhlNj15ebWfNP"), {
    plan: "pack5",
    credits: 5,
    mode: "payment",
  });
  assert.deepEqual(resolveStripePlan("price_1S4XsVQQU5vuhlNjzdQzeySA"), {
    plan: "monthly",
    credits: 3,
    mode: "subscription",
  });
  assert.deepEqual(resolveStripePlan("price_1S4Y6YQQU5vuhlNjeJFmshxX"), {
    plan: "yearly",
    credits: 36,
    mode: "subscription",
  });
});

test("Stripe plan allowlist rejects an arbitrary price id", () => {
  assert.equal(resolveStripePlan("price_attacker_selected"), null);
  assert.equal(resolveStripePlan(""), null);
});
