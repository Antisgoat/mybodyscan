import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeGymEquipment,
  validateGymEquipmentAnalysis,
  validateGymFrames,
} from "../lib/gymEquipment.js";

test("gym analysis binds the server-only OpenAI secret", () => {
  const keys = (
    analyzeGymEquipment.__endpoint?.secretEnvironmentVariables ?? []
  )
    .map((entry) => entry.key)
    .sort();
  assert.deepEqual(keys, ["OPENAI_API_KEY"]);
});

test("gym equipment analysis keeps known IDs and deduplicates by confidence", () => {
  const result = validateGymEquipmentAnalysis({
    detected: [
      { id: "dumbbells", confidence: 0.6, evidence: "one dumbbell" },
      { id: "dumbbells", confidence: 0.95, evidence: "full rack" },
      { id: "unknown_machine", confidence: 1, evidence: "guess" },
    ],
    uncertain: [
      { id: "dumbbells", confidence: 0.3, evidence: "duplicate" },
      { id: "squat_rack", confidence: 2, evidence: "uprights visible" },
    ],
    notes: "x".repeat(500),
  });

  assert.deepEqual(result.detected, [
    { id: "dumbbells", confidence: 0.95, evidence: "full rack" },
  ]);
  assert.deepEqual(result.uncertain, [
    { id: "squat_rack", confidence: 1, evidence: "uprights visible" },
  ]);
  assert.equal(result.notes.length, 300);
});

test("gym frame validation accepts supported image data URLs", () => {
  assert.deepEqual(validateGymFrames(["data:image/jpeg;base64,AAAA"]), [
    "data:image/jpeg;base64,AAAA",
  ]);
});

test("gym frame validation rejects unsupported or oversized batches", () => {
  assert.throws(() => validateGymFrames([]));
  assert.throws(() => validateGymFrames(["data:text/plain;base64,AAAA"]));
  assert.throws(() =>
    validateGymFrames(
      Array.from({ length: 7 }, () => "data:image/png;base64,AAAA")
    )
  );
});
