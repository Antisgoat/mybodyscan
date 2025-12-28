import { describe, expect, it } from "vitest";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";

describe("deriveNutritionGoals protein targets", () => {
  it("uses lean mass with a higher cut factor", () => {
    const goals = deriveNutritionGoals({
      weightKg: 90,
      bodyFatPercent: 20,
      goal: "lose_fat",
    });
    expect(goals.proteinGrams).toBe(159);
  });

  it("uses lean mass with a lower gain factor", () => {
    const goals = deriveNutritionGoals({
      weightKg: 90,
      bodyFatPercent: 20,
      goal: "gain_muscle",
    });
    expect(goals.proteinGrams).toBe(143);
  });

  it("prefers goal weight when body fat is missing", () => {
    const goals = deriveNutritionGoals({
      weightKg: 100,
      goalWeightKg: 80,
      goal: "lose_fat",
    });
    expect(goals.proteinGrams).toBe(168);
  });

  it("clamps very low protein to the minimum guardrail", () => {
    const goals = deriveNutritionGoals({
      weightKg: 40,
      goal: "maintain",
    });
    expect(goals.proteinGrams).toBe(110);
  });

  it("clamps very high protein to the maximum guardrail", () => {
    const goals = deriveNutritionGoals({
      weightKg: 200,
      goal: "gain_muscle",
    });
    expect(goals.proteinGrams).toBe(260);
  });
});
