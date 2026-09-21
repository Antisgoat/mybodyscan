import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePhysiqueScores } from "../lib/scan/physiqueScores.js";

test("server accepts only explicit numeric first-party physique scores", () => {
  assert.deepEqual(
    sanitizePhysiqueScores({
      chest: 71.6,
      back: 79,
      shoulders: 101,
      arms: -2,
      core: "strong",
      legs: null,
      bodyFat: 12,
    }),
    { chest: 72, back: 79, shoulders: 100 }
  );
});

test("server omits zero-scored regions rather than calling them weaknesses", () => {
  assert.deepEqual(sanitizePhysiqueScores({ chest: 40, legs: 0 }), {
    chest: 40,
  });
});

test("server never converts qualitative observations into numeric scores", () => {
  assert.deepEqual(
    sanitizePhysiqueScores({
      chest: "priority",
      back: "well developed",
      shoulders: "balanced",
    }),
    {}
  );
});
