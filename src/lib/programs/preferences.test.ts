import { describe, expect, it } from "vitest";
import {
  preferencesFromCoachProfile,
  safeProgramPreferences,
} from "./preferences";

describe("program preference safety", () => {
  it("does not allow 6-day PPL for beginners or injury conflicts", () => {
    expect(
      safeProgramPreferences({
        daysPerWeek: 6,
        focus: "push_pull_legs",
        experience: "beginner",
        equipment: "full_gym",
      }).focus
    ).not.toBe("push_pull_legs");
    expect(
      safeProgramPreferences(
        {
          daysPerWeek: 6,
          focus: "push_pull_legs",
          experience: "advanced",
          equipment: "full_gym",
        },
        { injuries: ["shoulder"] }
      ).focus
    ).not.toBe("push_pull_legs");
  });

  it("derives plan preferences from onboarding profile fields", () => {
    const prefs = preferencesFromCoachProfile({
      goal: "lose_fat",
      training_days_per_week: 3,
      equipment: "dumbbells",
      experience: "intermediate",
      injuries: [],
    });
    expect(prefs).toMatchObject({
      goal: "fat_loss",
      daysPerWeek: 3,
      equipment: "dumbbells",
      experience: "intermediate",
      focus: "full_body",
    });
  });
});
