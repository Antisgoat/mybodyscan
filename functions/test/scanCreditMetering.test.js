import assert from "node:assert/strict";
import test from "node:test";

import { shouldBypassScanCredits } from "../lib/lib/scanCreditAccess.js";

test("a Pro subscription remains metered for granted scan credits", () => {
  assert.equal(
    shouldBypassScanCredits({
      staff: false,
      unlimitedClaim: false,
      unlimitedMirror: false,
      proEntitled: true,
    }),
    false
  );
});

test("only staff or explicitly unlimited accounts bypass scan credits", () => {
  assert.equal(
    shouldBypassScanCredits({
      staff: true,
      unlimitedClaim: false,
      unlimitedMirror: false,
    }),
    true
  );
  assert.equal(
    shouldBypassScanCredits({
      staff: false,
      unlimitedClaim: true,
      unlimitedMirror: false,
    }),
    true
  );
  assert.equal(
    shouldBypassScanCredits({
      staff: false,
      unlimitedClaim: false,
      unlimitedMirror: true,
    }),
    true
  );
});
