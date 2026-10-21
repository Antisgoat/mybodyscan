import assert from "node:assert/strict";
import test from "node:test";
import { computeCalories } from "../lib/lib/nutritionCalories.js";

test("database portions keep source calories, even when rounded macro factors differ", () => {
  const value = computeCalories({
    id: "almonds",
    name: "Almonds",
    calories: 160,
    protein: 6,
    carbs: 6,
    fat: 14,
    item: { name: "Almonds", source: "USDA" },
  });
  assert.equal(value.calories, 160);
  assert.equal(value.caloriesFromMacros, 174);
});
test("manual inconsistent macros still reconcile and quick add remains calories-only", () => {
  assert.equal(
    computeCalories({
      name: "Manual",
      calories: 500,
      protein: 10,
      carbs: 10,
      fat: 10,
    }).calories,
    170
  );
  assert.equal(
    computeCalories({ name: "Quick add", calories: 550 }).calories,
    550
  );
});
