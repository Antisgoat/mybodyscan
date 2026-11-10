import { describe, expect, it } from "vitest";
import { nextScheduledWorkout } from "./nextScheduledWorkout";
import { todayNextAction } from "./todayNextAction";

describe("daily guidance", () => {
  it("prioritizes a workout and distinguishes starting from continuing", () => {
    const input = {
      hasWorkout: true,
      hasPlan: true,
      mealLogged: false,
      mealLoaded: true,
    };
    expect(todayNextAction({ ...input, workoutDone: 0 }).path).toBe(
      "/workouts"
    );
    expect(todayNextAction({ ...input, workoutDone: 1 }).label).toMatch(
      /continue/i
    );
  });
  it("does not assume an empty diary when meal loading failed", () => {
    const input = {
      hasWorkout: false,
      hasPlan: true,
      workoutDone: 0,
      mealLogged: false,
    };
    expect(todayNextAction({ ...input, mealLoaded: false }).path).toBe(
      "/weekly-review"
    );
    expect(todayNextAction({ ...input, mealLoaded: true }).path).toBe("/meals");
    expect(
      todayNextAction({ ...input, hasPlan: false, mealLoaded: false }).path
    ).toBe("/programs");
  });
  it("targets today if scheduled, otherwise picks the closest upcoming date", () => {
    const saturday = new Date(2026, 10, 28, 23, 59);
    expect(nextScheduledWorkout(["Mon", "Sat"], saturday)).toEqual({
      dayId: "Sat",
      localDate: "2026-11-28",
    });
    expect(nextScheduledWorkout(["Fri", "Tue"], saturday)).toEqual({
      dayId: "Tue",
      localDate: "2026-12-01",
    });
    expect(nextScheduledWorkout([], saturday)).toBeNull();
    expect(saturday.getDate()).toBe(28);
  });
});
