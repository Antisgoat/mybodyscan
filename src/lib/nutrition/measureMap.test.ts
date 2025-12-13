import { describe, it, expect } from "vitest";
import { calcMacrosFromGrams } from "@/lib/nutrition/measureMap";

describe("measureMap calcMacrosFromGrams guardrails", () => {
  it("does not throw when basePer100g is missing (regression for production r.kcal crash)", () => {
    expect(() => calcMacrosFromGrams(undefined as any, 150)).not.toThrow();
    expect(calcMacrosFromGrams(undefined as any, 150)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it("always returns numeric macros", () => {
    const out = calcMacrosFromGrams({ kcal: 200, protein: 10, carbs: 20, fat: 5 }, 50);
    expect(Number.isFinite(out.kcal)).toBe(true);
    expect(Number.isFinite(out.protein)).toBe(true);
    expect(Number.isFinite(out.carbs)).toBe(true);
    expect(Number.isFinite(out.fat)).toBe(true);
  });
});

