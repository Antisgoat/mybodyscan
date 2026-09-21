import { describe, expect, it } from "vitest";
import type { ScanDocument } from "@/lib/api/scan";
import { resolveNutritionTargets } from "./resolveTargets";

const completedScan = {
  status: "complete",
  resultSource: "ai",
  usedFallback: false,
  completedAt: new Date(),
  photoPaths: { front: "f", back: "b", left: "l", right: "r" },
  input: { currentWeightKg: 90.7, goalWeightKg: 74.8 },
  estimate: { bodyFatPercent: 29 },
  nutritionPlan: {
    caloriesPerDay: 2280,
    proteinGrams: 200,
    carbsGrams: 244,
    fatsGrams: 56,
  },
} as unknown as ScanDocument;

describe("shared nutrition targets", () => {
  it("uses the completed scan across the diary, coach, and meal plan", () => {
    const result = resolveNutritionTargets({ scan: completedScan });
    expect(result.source).toBe("scan");
    expect(result.goals).toMatchObject({
      calories: 2280,
      proteinGrams: 200,
      carbsGrams: 244,
      fatGrams: 56,
    });
  });

  it("reconciles carbohydrates after an accepted weekly adjustment", () => {
    const result = resolveNutritionTargets({
      scan: completedScan,
      calorieDelta: -100,
    });
    expect(result.goals.calories).toBe(2180);
    expect(result.goals.proteinGrams).toBe(200);
    expect(result.goals.fatGrams).toBe(56);
    expect(result.goals.carbsGrams).toBe(219);
  });

  it("does not use failed or fallback scan targets", () => {
    const failed = {
      ...completedScan,
      status: "error",
    } as ScanDocument;
    const result = resolveNutritionTargets({ scan: failed });
    expect(result.source).toBe("profile");
    expect(result.goals.calories).not.toBe(2280);
  });
});
