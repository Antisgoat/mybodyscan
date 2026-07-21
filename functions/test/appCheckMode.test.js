import assert from "node:assert/strict";
import test from "node:test";

import { getAppCheckMode } from "../lib/lib/env.js";
import { shouldEnforceAppCheck } from "../lib/util/callable.js";

test("App Check defaults to soft and never enforces callables", () => {
  const previous = process.env.APP_CHECK_MODE;
  try {
    delete process.env.APP_CHECK_MODE;
    assert.equal(getAppCheckMode(), "soft");
    assert.equal(shouldEnforceAppCheck(), false);
  } finally {
    if (previous == null) delete process.env.APP_CHECK_MODE;
    else process.env.APP_CHECK_MODE = previous;
  }
});

test("strict is the only mode that enforces callable App Check", () => {
  assert.equal(shouldEnforceAppCheck("strict"), true);
  assert.equal(shouldEnforceAppCheck("STRICT"), true);
  assert.equal(shouldEnforceAppCheck("soft"), false);
  assert.equal(shouldEnforceAppCheck("disabled"), false);
  assert.equal(shouldEnforceAppCheck("unexpected"), false);
});
