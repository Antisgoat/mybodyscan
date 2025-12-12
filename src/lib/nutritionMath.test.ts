import { describe, it, expect } from "vitest";
import { estimateServingWeight } from "@/lib/nutritionMath";

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
});

