import { describe, it, expect } from "vitest";
import {
  availableServingUnits,
  calculateSelection,
  estimateServingWeight,
  snapshotFromItem,
  normalizedFromSnapshot,
} from "@/lib/nutritionMath";
import { toRichFoodItem } from "@/lib/nutrition/toFoodItem";

const sample = () =>
  toRichFoodItem({
    id: "sample",
    name: "Food",
    serving: 100,
    unit: "g",
    calories: 200,
    protein: 20,
    carbs: 10,
    fat: 9,
  });

describe("nutritionMath guardrails", () => {
  it.each(["1/2 cup", "½ cup", "0.5 cup", "half cup"])(
    "handles fraction label %s",
    (label) => {
      const item = sample();
      item.servings = [{ id: "cup", label, grams: 40, isDefault: true }];
      expect(calculateSelection(item, 1, "cups").grams).toBe(80);
    }
  );

  it.each(["1 1/2 cup", "1½ cup", "1.5 cups"])(
    "handles mixed fraction label %s",
    (label) => {
      const item = sample();
      item.servings = [{ id: "cup", label, grams: 120 }];
      expect(calculateSelection(item, 1, "cups").grams).toBe(80);
    }
  );

  it("rejects zero-denominator household measures", () => {
    const item = sample();
    item.servings = [{ id: "cup", label: "1/0 cup", grams: 40 }];
    expect(availableServingUnits(item)).not.toContain("cups");
  });

  it("keeps metric and imperial mass calculations equivalent", () => {
    const item = sample();
    const expected = calculateSelection(item, 453.59237, "g");
    expect(calculateSelection(item, 1, "lb")).toEqual(expected);
    expect(calculateSelection(item, 16, "oz")).toEqual(expected);
    expect(calculateSelection(item, 0.45359237, "kg")).toEqual(expected);
  });

  it("preserves source portion weights and nutrition through a saved snapshot", () => {
    const item = sample();
    item.servings = [{ id: "cup", label: "½ cup", grams: 40, isDefault: true }];
    const restored = normalizedFromSnapshot(snapshotFromItem(item));
    expect(calculateSelection(restored, 2, "cups")).toEqual(
      calculateSelection(item, 2, "cups")
    );
    expect(restored.servings).toEqual(item.servings);
  });

  it("does not invent 100g for legacy snapshots with unknown portion weight", () => {
    const item = normalizedFromSnapshot({
      name: "Old serving",
      source: "USDA",
      serving: { qty: 1, unit: "serving" },
      per_serving: { kcal: 70, protein_g: 6, carbs_g: 0, fat_g: 5 },
    });
    expect(estimateServingWeight(item)).toBeNull();
    expect(availableServingUnits(item)).toEqual(["serving"]);
    expect(calculateSelection(item, 2, "serving").calories).toBe(140);
  });

  it("keeps a labeled large egg at 70 calories per serving", () => {
    const item = sample();
    item.serving = { qty: 50, unit: "g", text: "1 large egg" };
    item.per_serving = { kcal: 70, protein_g: 6, carbs_g: 0, fat_g: 5 };
    item.per_100g = { kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 };
    expect(calculateSelection(item, 1, "serving").calories).toBe(70);
    expect(calculateSelection(item, 100, "g").calories).toBe(143);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid quantity %s", (qty) => {
    expect(calculateSelection(sample(), qty, "g").calories).toBeNull();
  });

  it("preserves unknown nutrients and refuses coerced strings", () => {
    const item = toRichFoodItem({
      name: "Incomplete",
      serving: 1,
      unit: "piece",
      calories: 100,
      protein: null,
    });
    expect(item.per_serving.protein_g).toBeNull();
    expect(availableServingUnits(item)).not.toContain("g");
    expect(calculateSelection(item, 1, "serving").protein).toBeNull();
    item.per_serving.protein_g = "12" as unknown as number;
    expect(calculateSelection(item, 1, "serving").protein).toBeNull();
  });

  it("supports labeled liters without inventing mass", () => {
    const item = toRichFoodItem({
      name: "Drink",
      serving: 0.25,
      unit: "l",
      calories: 120,
      protein: 2,
      carbs: 28,
      fat: 0,
    });
    expect(calculateSelection(item, 0.125, "l")).toEqual(
      calculateSelection(item, 125, "ml")
    );
    expect(calculateSelection(item, 1, "serving").grams).toBeNull();
  });
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
