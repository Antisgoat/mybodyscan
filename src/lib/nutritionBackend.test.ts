import { describe, expect, it } from "vitest";
import { computeCalories } from "@/lib/nutritionBackend";

describe("nutritionBackend.computeCalories", () => {
  it("preserves source calories for a selected database food, including fiber adjustments", () => {
    const out = computeCalories({
      name: "Almonds",
      calories: 160,
      protein: 6,
      carbs: 6,
      fat: 14,
      item: { name: "Almonds", source: "USDA" },
    });
    expect(out.calories).toBe(160);
    expect(out.caloriesFromMacros).toBe(174);
    expect(out.reconciled).toBe(false);
  });
  it("trusts calories when macros are empty (Quick Add)", () => {
    const out = computeCalories({
      name: "Quick add",
      calories: 550,
      protein: 0,
      carbs: 0,
      fat: 0,
      alcohol: 0,
    });
    expect(out.calories).toBe(550);
    expect(out.caloriesInput).toBe(550);
  });

  it("prefers macro-derived calories when macros are present and mismatch significantly", () => {
    const out = computeCalories({
      name: "Test",
      calories: 500,
      protein: 10, // 40
      carbs: 10, // 40
      fat: 10, // 90 => 170 total
    });
    expect(out.calories).toBe(170);
    expect(out.caloriesFromMacros).toBe(170);
    expect(out.caloriesInput).toBe(500);
  });
});
