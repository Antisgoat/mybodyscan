import { describe, expect, it } from "vitest";
import {
  buildCustomFoodItem,
  buildRecipeItem,
  saveCustomFood,
} from "@/lib/nutritionCollections";

describe("private food builders", () => {
  it("preserves label macros and derives per-100g values only from stated grams", () => {
    const item = buildCustomFoodItem({
      id: "label-food",
      name: "Label yogurt",
      servingQty: 1,
      servingUnit: "container",
      servingGrams: 170,
      calories: 120,
      protein: 18,
      carbs: 8,
      fat: 1,
    });
    expect(item.source).toBe("User label");
    expect(item.per_serving.protein_g).toBe(18);
    expect(item.per_100g?.protein_g).toBeCloseTo(10.588, 2);
  });

  it("does not invent gram conversions when the package has no serving weight", () => {
    const item = buildCustomFoodItem({
      name: "Label bar",
      servingUnit: "bar",
      calories: 210,
      protein: 20,
      carbs: 24,
      fat: 6,
    });
    expect(item.per_100g).toBeNull();
    expect(item.servings).toEqual([]);
  });

  it("calculates recipe nutrition per requested serving", () => {
    const ingredient = buildCustomFoodItem({
      id: "ingredient",
      name: "Ingredient",
      servingUnit: "cup",
      calories: 200,
      protein: 10,
      carbs: 30,
      fat: 5,
    });
    const recipe = buildRecipeItem({
      name: "Two serving recipe",
      servings: 2,
      ingredients: [{ item: ingredient, qty: 2, unit: "serving" }],
    });
    expect(recipe.source).toBe("User recipe");
    expect(recipe.per_serving.kcal).toBe(200);
    expect(recipe.per_serving.protein_g).toBe(10);
  });

  it("fails closed when a custom food label was not verified", async () => {
    const item = buildCustomFoodItem({
      name: "Unverified food",
      servingUnit: "serving",
      calories: 100,
      protein: 5,
      carbs: 10,
      fat: 4,
    });

    await expect(
      saveCustomFood(
        {
          item,
          allergens: [],
          labelVerified: false,
        },
        "test-user"
      )
    ).rejects.toThrow(/current package label/i);
  });
});
