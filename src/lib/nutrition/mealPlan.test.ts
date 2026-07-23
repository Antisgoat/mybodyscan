import { describe, expect, it } from "vitest";
import {
  buildWeeklyMealPlan,
  normalizeMealPlanDiet,
} from "@/lib/nutrition/mealPlan";

const targets = {
  calories: 2175,
  proteinGrams: 163,
  carbsGrams: 241,
  fatGrams: 63,
};

describe("weekly meal plan", () => {
  it("creates seven complete days whose meal targets add up exactly", () => {
    const plan = buildWeeklyMealPlan(targets, "balanced");
    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.meals).toHaveLength(4);
      expect(day.meals.reduce((sum, meal) => sum + meal.calories, 0)).toBe(
        targets.calories
      );
      expect(
        day.meals.reduce((sum, meal) => sum + meal.proteinGrams, 0)
      ).toBe(targets.proteinGrams);
      expect(day.meals.reduce((sum, meal) => sum + meal.carbsGrams, 0)).toBe(
        targets.carbsGrams
      );
      expect(day.meals.reduce((sum, meal) => sum + meal.fatGrams, 0)).toBe(
        targets.fatGrams
      );
    }
  });

  it("normalizes saved diet values and keeps vegan ideas plant-based", () => {
    expect(normalizeMealPlanDiet("low-carb")).toBe("lower_carb");
    expect(normalizeMealPlanDiet("keto")).toBe("lower_carb");
    expect(normalizeMealPlanDiet("unknown")).toBe("balanced");

    const veganText = buildWeeklyMealPlan(targets, "vegan").days
      .flatMap((day) => day.meals)
      .map((meal) => meal.title)
      .join(" ");
    expect(veganText).not.toMatch(
      /\b(chicken|turkey|beef|salmon|tuna|shrimp|cod|eggs?|greek yogurt|string cheese|cottage cheese)\b/i
    );
  });

  it("uses safe minimum calories when targets are missing or invalid", () => {
    const plan = buildWeeklyMealPlan(
      {
        calories: Number.NaN,
        proteinGrams: Number.NaN,
        carbsGrams: Number.NaN,
        fatGrams: Number.NaN,
      },
      null
    );
    expect(plan.days[0].totals.calories).toBe(2200);
    expect(plan.diet).toBe("balanced");
  });
});
