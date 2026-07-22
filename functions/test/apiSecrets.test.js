import assert from "node:assert/strict";
import test from "node:test";

import { api } from "../lib/index.js";

test("aggregate API binds every router runtime secret", () => {
  const secretKeys = (api.__endpoint?.secretEnvironmentVariables ?? [])
    .map((entry) => entry.key)
    .sort();

  assert.deepEqual(secretKeys, [
    "OPENAI_API_KEY",
    "STRIPE_SECRET",
    "STRIPE_SECRET_KEY",
    "USDA_FDC_API_KEY",
  ]);
});
