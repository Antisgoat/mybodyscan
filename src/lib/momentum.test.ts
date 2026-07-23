import { describe, expect, it } from "vitest";
import { deriveDailyMomentum } from "@/lib/momentum";

describe("daily momentum", () => {
  it("tracks completed process actions without scoring appearance or weight", () => {
    const result = deriveDailyMomentum({
      mealCalories: 840,
      workoutDone: 4,
      workoutTotal: 4,
    });
    expect(result).toMatchObject({ completed: 2, available: 2, percent: 100 });
    expect(result.actions.map((action) => action.id)).toEqual([
      "nutrition",
      "workout",
    ]);
  });

  it("does not penalize a rest day or missing workout plan", () => {
    const result = deriveDailyMomentum({
      mealCalories: 500,
      workoutDone: 0,
      workoutTotal: 0,
    });
    expect(result).toMatchObject({ completed: 1, available: 1, percent: 100 });
    expect(result.actions).toHaveLength(1);
  });

  it("treats partial workouts as useful activity but not a completed action", () => {
    const result = deriveDailyMomentum({
      mealCalories: 0,
      workoutDone: 2,
      workoutTotal: 4,
    });
    expect(result).toMatchObject({ completed: 0, available: 2, percent: 0 });
  });
});
