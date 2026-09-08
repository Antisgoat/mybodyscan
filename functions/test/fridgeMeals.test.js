import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeFridge,
  normalizeConfirmedIngredients,
  suggestFridgeMeals,
  validateFridgeAnalysis,
  validateFridgeFrames,
  validateFridgeMealSuggestions,
  validateFridgeMealInventory,
  requireFridgeProcessingConsent,
} from "../lib/fridgeMeals.js";

test("kitchen processing requires explicit permission", () => {
  for (const value of [undefined, false, "true", 1]) {
    assert.throws(
      () => requireFridgeProcessingConsent(value),
      /Confirm permission/
    );
  }
  assert.doesNotThrow(() => requireFridgeProcessingConsent(true));
});

test("fridge functions bind only the server-side OpenAI secret", () => {
  for (const endpoint of [analyzeFridge, suggestFridgeMeals]) {
    const keys = (endpoint.__endpoint?.secretEnvironmentVariables ?? [])
      .map((entry) => entry.key)
      .sort();
    assert.deepEqual(keys, ["OPENAI_API_KEY"]);
  }
});

test("meal inventory rejects food that the member never confirmed", () => {
  const meal = {
    title: "Skillet",
    summary: "A simple meal",
    steps: ["Cook the ingredients."],
    uses: ["eggs"],
    optional: ["oil"],
  };
  assert.equal(
    validateFridgeMealInventory({ meals: [meal] }, ["Eggs"]).meals.length,
    1
  );
  assert.throws(
    () => validateFridgeMealInventory({ meals: [meal] }, ["spinach"]),
    /unconfirmed_fridge_ingredient/
  );
  assert.throws(
    () => validateFridgeMealInventory({ meals: [meal] }, ["eggs"], "exact"),
    /optional_ingredient_not_allowed/
  );
  assert.equal(
    validateFridgeMealInventory(
      { meals: [{ ...meal, optional: [] }] },
      ["eggs"],
      "exact"
    ).meals.length,
    1
  );
  assert.throws(
    () =>
      validateFridgeMealInventory({ meals: [{ ...meal, uses: [] }] }, ["eggs"]),
    /unconfirmed_fridge_ingredient/
  );
});

test("fridge analysis normalizes and deduplicates visible ingredients", () => {
  const result = validateFridgeAnalysis({
    detected: [
      { name: "Eggs", confidence: 0.5, evidence: "carton" },
      { name: "eggs", confidence: 0.95, evidence: "open carton" },
    ],
    uncertain: [
      { name: "EGGS", confidence: 0.2, evidence: "duplicate" },
      { name: "Yogurt", confidence: 2, evidence: "partly covered tub" },
    ],
    notes: "n".repeat(400),
  });
  assert.deepEqual(result.detected, [
    { name: "eggs", confidence: 0.95, evidence: "open carton" },
  ]);
  assert.equal(result.uncertain[0].confidence, 1);
  assert.equal(result.notes.length, 300);
});

test("fridge inputs enforce image and ingredient limits", () => {
  assert.deepEqual(validateFridgeFrames(["data:image/jpeg;base64,AAAA"]), [
    "data:image/jpeg;base64,AAAA",
  ]);
  assert.throws(() => validateFridgeFrames([]));
  assert.throws(() => validateFridgeFrames(["data:text/plain;base64,AAAA"]));
  assert.deepEqual(
    normalizeConfirmedIngredients([" Eggs ", "eggs", "Spinach", ""]),
    ["eggs", "Spinach"]
  );
});

test("meal suggestion validation rejects empty or incomplete outputs", () => {
  assert.throws(() => validateFridgeMealSuggestions({ meals: [] }));
  const result = validateFridgeMealSuggestions({
    meals: [
      {
        title: "Egg skillet",
        summary: "A quick skillet.",
        uses: ["eggs", "spinach"],
        optional: ["pepper"],
        steps: ["Cook until set."],
        estimatedMinutes: 12,
        whyItFits: "Uses the confirmed ingredients.",
        safetyNote: "Cook eggs thoroughly.",
      },
    ],
  });
  assert.equal(result.meals[0].estimatedMinutes, 12);
});
