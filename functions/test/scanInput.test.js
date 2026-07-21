import assert from "node:assert/strict";
import test from "node:test";

import { buildScanInput } from "../lib/scan/input.js";

test("scan input omits absent optional height for Firestore", () => {
  const input = buildScanInput(82.7, 77.1);

  assert.deepEqual(input, {
    currentWeightKg: 82.7,
    goalWeightKg: 77.1,
  });
  assert.equal(Object.values(input).includes(undefined), false);
});

test("scan input preserves a valid height", () => {
  assert.deepEqual(buildScanInput(82.7, 77.1, 181), {
    currentWeightKg: 82.7,
    goalWeightKg: 77.1,
    heightCm: 181,
  });
});
