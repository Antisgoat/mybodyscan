import { describe, expect, it } from "vitest";
import { calculateRecipeTotals } from "./recipeTotals";
import type { FoodItem } from "./types";

export const recipeTestFood: FoodItem = {
  id: "fixture-food",
  name: "Test food",
  brand: null,
  source: "USDA",
  basePer100g: { kcal: 200, protein: 20, carbs: 10, fat: 5 },
  servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
  serving: { qty: 1, unit: "serving", text: "100 g" },
  per_serving: { kcal: 200, protein_g: 20, carbs_g: 10, fat_g: 5 },
};
describe("measured recipe nutrition", () => {
  it("scales actual quantities and divides totals by servings", () => {
    const result = calculateRecipeTotals(
      [{ item: recipeTestFood, qty: 250, unit: "g" }],
      2
    );
    expect(result.total).toEqual({
      calories: 500,
      protein: 50,
      carbs: 25,
      fat: 12.5,
    });
    expect(result.perServing).toEqual({
      calories: 250,
      protein: 25,
      carbs: 12.5,
      fat: 6.25,
    });
  });
  it("adds every explicitly included ingredient, including cooking oil", () => {
    expect(
      calculateRecipeTotals(
        [
          { item: recipeTestFood, qty: 1, unit: "serving" },
          {
            item: {
              ...recipeTestFood,
              name: "Oil fixture",
              basePer100g: { kcal: 900, protein: 0, carbs: 0, fat: 100 },
            },
            qty: 10,
            unit: "g",
          },
        ],
        1
      ).total
    ).toEqual({ calories: 290, protein: 20, carbs: 10, fat: 15 });
  });
  it.each([0, -1, NaN, Infinity, 100_001])(
    "rejects invalid ingredient quantity %s",
    (qty) => {
      expect(() =>
        calculateRecipeTotals([{ item: recipeTestFood, qty, unit: "g" }], 2)
      ).toThrow();
    }
  );
  it.each([0, -1, 1.5, NaN, Infinity, 101])(
    "does not silently round invalid servings %s",
    (servings) => {
      expect(() =>
        calculateRecipeTotals(
          [{ item: recipeTestFood, qty: 100, unit: "g" }],
          servings
        )
      ).toThrow();
    }
  );
  it("rejects unknown nutrient values rather than treating them as zero", () => {
    const food = {
      ...recipeTestFood,
      per_100g: { kcal: 200, protein_g: null, carbs_g: 10, fat_g: 5 },
    };
    expect(() =>
      calculateRecipeTotals([{ item: food, qty: 100, unit: "g" }], 1)
    ).toThrow(/missing valid nutrients/);
  });
  it("rejects non-finite nutrients", () => {
    const food = {
      ...recipeTestFood,
      basePer100g: { ...recipeTestFood.basePer100g, kcal: Infinity },
    };
    expect(() =>
      calculateRecipeTotals([{ item: food, qty: 100, unit: "g" }], 1)
    ).toThrow();
  });
  it("does not invent a grams conversion for label-only foods", () => {
    const food = {
      ...recipeTestFood,
      per_100g: null,
      servings: [],
      serving: { qty: 1, unit: "bar" },
    };
    expect(() =>
      calculateRecipeTotals([{ item: food, qty: 100, unit: "g" }], 1)
    ).toThrow(/conversion/);
  });
  it("requires at least one ingredient", () => {
    expect(() => calculateRecipeTotals([], 2)).toThrow();
  });
});
