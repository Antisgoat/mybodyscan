import { describe, it, expect } from "vitest";
import {
  availableServingUnits,
  calculateSelection,
  estimateServingWeight,
} from "@/lib/nutritionMath";

describe("nutritionMath guardrails", () => {
  it("does not throw when per_serving is missing (regression for iOS 'r.kcal' crash)", () => {
    const unsafeItem: any = {
      id: "x",
      name: "Test Food",
      brand: null,
      source: "USDA",
      basePer100g: { kcal: 100, protein: 10, carbs: 10, fat: 10 },
      // No serving weights available (forces nutritionMath to use macro inference paths)
      servings: [],
      serving: { qty: 1, unit: "serving", text: "1 serving" },
      // per_serving intentionally omitted
      per_100g: { kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10 },
    };

    expect(() => estimateServingWeight(unsafeItem)).not.toThrow();
    expect(estimateServingWeight(unsafeItem)).toBeNull();
  });

  it("uses labeled milliliters without assuming liquid density", () => {
    const drink: any = {
      id: "drink",
      name: "Drink",
      brand: null,
      source: "Open Food Facts",
      basePer100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      servings: [{ id: "100g", label: "100 g", grams: 100 }],
      serving: { qty: 250, unit: "ml", text: "250 ml" },
      per_serving: { kcal: 120, protein_g: 2, carbs_g: 28, fat_g: 0 },
      per_100g: null,
    };

    expect(availableServingUnits(drink)).toContain("ml");
    expect(availableServingUnits(drink)).not.toContain("g");
    expect(availableServingUnits(drink)).not.toContain("oz");
    expect(calculateSelection(drink, 125, "ml")).toEqual({
      grams: null,
      calories: 60,
      protein: 1,
      carbs: 14,
      fat: 0,
    });
    expect(calculateSelection(drink, 1, "serving")).toEqual({
      grams: null,
      calories: 120,
      protein: 2,
      carbs: 28,
      fat: 0,
    });
  });

  it("only offers household units backed by source serving weights", () => {
    const oats: any = {
      id: "oats",
      name: "Oats",
      brand: null,
      source: "USDA",
      basePer100g: { kcal: 380, protein: 13, carbs: 68, fat: 7 },
      servings: [
        { id: "100g", label: "100 g", grams: 100 },
        { id: "cup", label: "0.5 cup", grams: 40, isDefault: true },
      ],
      serving: { qty: 40, unit: "g", text: "0.5 cup" },
      per_serving: { kcal: 152, protein_g: 5.2, carbs_g: 27.2, fat_g: 2.8 },
      per_100g: { kcal: 380, protein_g: 13, carbs_g: 68, fat_g: 7 },
    };

    expect(availableServingUnits(oats)).toContain("cups");
    expect(availableServingUnits(oats)).not.toContain("slices");
    expect(calculateSelection(oats, 1, "cups").grams).toBe(80);
  });
});
