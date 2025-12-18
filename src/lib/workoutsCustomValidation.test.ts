import { describe, it, expect } from "vitest";
import { validateWorkoutPlanDays } from "./workoutsCustomValidation";

describe("workouts custom plan validation", () => {
  it("rejects empty plans", () => {
    expect(validateWorkoutPlanDays([] as any)).toMatch("At least one");
  });

  it("requires Mon–Sun day names", () => {
    expect(
      validateWorkoutPlanDays([
        { day: "Monday" as any, exercises: [{ name: "Squat", sets: 3, reps: "10" }] },
      ])
    ).toMatch("Mon–Sun");
  });

  it("requires unique days", () => {
    expect(
      validateWorkoutPlanDays([
        { day: "Mon" as any, exercises: [{ name: "Squat", sets: 3, reps: "10" }] },
        { day: "Mon" as any, exercises: [{ name: "Press", sets: 3, reps: "10" }] },
      ])
    ).toMatch("unique");
  });

  it("requires exercises per day", () => {
    expect(validateWorkoutPlanDays([{ day: "Mon" as any, exercises: [] as any }])).toMatch(
      "at least one exercise"
    );
  });

  it("accepts valid days", () => {
    expect(
      validateWorkoutPlanDays([
        { day: "Mon" as any, exercises: [{ name: "Squat", sets: 3, reps: "10" }] },
        { day: "Wed" as any, exercises: [{ name: "Row", sets: 3, reps: "10" }] },
      ])
    ).toBeNull();
  });
});

