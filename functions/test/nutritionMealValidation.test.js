import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMeal,
  safeNutritionNumber,
} from "../lib/lib/nutritionMealValidation.js";

const valid = () => ({
  id: "meal-1",
  name: "Lunch",
  calories: 400,
  protein: 30,
  carbs: 40,
  fat: 10,
});

test("meal validation accepts complete, zero, and calories-only logs", () => {
  for (const meal of [
    valid(),
    { id: "zero", name: "Water", calories: 0 },
    { id: "quick", name: "Quick add", calories: 100 },
  ]) {
    assert.doesNotThrow(() => validateMeal(meal));
  }
});

test("meal validation rejects malformed or unsafe nutrition payloads", () => {
  for (const value of ["30", {}, [], true, -1, NaN, Infinity, 100001]) {
    assert.throws(() => validateMeal({ ...valid(), calories: value }), {
      code: "invalid-argument",
    });
  }
  for (const change of [
    { name: {} },
    { id: {} },
    { notes: {} },
    { notes: "x".repeat(1001) },
    { protein: 10001 },
    { name: " " },
  ]) {
    assert.throws(() => validateMeal({ ...valid(), ...change }), {
      code: "invalid-argument",
    });
  }
  assert.throws(() => validateMeal({ id: "empty", name: "Unknown" }), {
    code: "invalid-argument",
  });
});

test("unknown snapshot nutrients never become zero or coerced numbers", () => {
  for (const value of [null, undefined, "", "3", false, NaN, Infinity, -1])
    assert.equal(safeNutritionNumber(value), null);
  assert.equal(safeNutritionNumber(0), 0);
  assert.equal(safeNutritionNumber(3.5), 3.5);
});
