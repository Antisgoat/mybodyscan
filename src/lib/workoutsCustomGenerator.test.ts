import { describe, expect, it } from "vitest";
import type { CustomPlanPrefs } from "@/lib/workouts";
import type { MovementPattern } from "@/data/exercises";
import { getExerciseByExactName, searchExercises } from "@/lib/exercises/library";
import { generateCustomPlanDaysFromLibrary } from "@/lib/workoutsCustomGenerator";

function patternsForDay(day: { exercises: Array<{ name: string }> }): Set<MovementPattern> {
  const out = new Set<MovementPattern>();
  for (const ex of day.exercises) {
    const lib = getExerciseByExactName(ex.name);
    if (lib) out.add(lib.movementPattern);
  }
  return out;
}

function primaryCompoundIdsForWeek(days: Array<{ exercises: Array<{ name: string }> }>): string[] {
  const ids: string[] = [];
  for (const d of days) {
    for (const ex of d.exercises) {
      const lib = getExerciseByExactName(ex.name);
      if (lib?.tags.includes("primary_compound")) ids.push(lib.id);
    }
  }
  return ids;
}

describe("custom plan generation (exercise library)", () => {
  it("variant changes produce different (but valid) plans", () => {
    const prefs: CustomPlanPrefs = {
      goal: "build_muscle",
      experience: "intermediate",
      focus: "full_body",
      daysPerWeek: 3,
      preferredDays: ["Mon", "Wed", "Fri"],
      timePerWorkout: "45",
      equipment: ["gym"],
      trainingStyle: "balanced",
    };

    const v1 = generateCustomPlanDaysFromLibrary(prefs, { variant: 1 });
    const v2 = generateCustomPlanDaysFromLibrary(prefs, { variant: 2 });

    const names1 = v1.flatMap((d) => d.exercises.map((e) => e.name)).join("|");
    const names2 = v2.flatMap((d) => d.exercises.map((e) => e.name)).join("|");
    expect(names1).not.toEqual(names2);

    // Still meets basic patterns.
    for (const d of v1) {
      const patterns = patternsForDay(d);
      expect(patterns.has("squat") || patterns.has("hinge")).toBe(true);
      expect(patterns.has("horizontal_push") || patterns.has("vertical_push")).toBe(true);
      expect(patterns.has("horizontal_pull") || patterns.has("vertical_pull")).toBe(true);
    }
  });

  it("PPL 6-day: each day meets required movement patterns and avoids duplicate primary compounds", () => {
    const prefs: CustomPlanPrefs = {
      goal: "build_muscle",
      experience: "intermediate",
      focus: "push_pull_legs",
      daysPerWeek: 6,
      preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      timePerWorkout: "45",
      equipment: ["gym"],
      trainingStyle: "balanced",
    };
    const days = generateCustomPlanDaysFromLibrary(prefs, { variant: 1 });
    expect(days).toHaveLength(6);

    // Day order is deterministic by template cycle.
    const expectations: Array<Array<MovementPattern>> = [
      ["horizontal_push", "vertical_push"], // Push A
      ["vertical_pull", "horizontal_pull"], // Pull A
      ["squat", "hinge"], // Legs A
      ["horizontal_push", "vertical_push"], // Push B
      ["vertical_pull", "horizontal_pull"], // Pull B
      ["squat", "hinge"], // Legs B
    ];
    days.forEach((day, idx) => {
      const patterns = patternsForDay(day);
      for (const required of expectations[idx]!) {
        expect(patterns.has(required)).toBe(true);
      }
    });

    const primaryIds = primaryCompoundIdsForWeek(days);
    const unique = new Set(primaryIds);
    // Guardrail: should not repeat primary compounds in a single week unless forced.
    expect(unique.size).toBe(primaryIds.length);
  });

  it("Upper/Lower 4-day: upper days include push + pull patterns; lower days include squat + hinge", () => {
    const prefs: CustomPlanPrefs = {
      goal: "recomp",
      experience: "beginner",
      focus: "upper_lower",
      daysPerWeek: 4,
      preferredDays: ["Mon", "Tue", "Thu", "Fri"],
      timePerWorkout: "45",
      equipment: ["gym"],
      trainingStyle: "balanced",
    };
    const days = generateCustomPlanDaysFromLibrary(prefs);
    expect(days).toHaveLength(4);

    const upper1 = patternsForDay(days[0]!);
    const lower1 = patternsForDay(days[1]!);
    const upper2 = patternsForDay(days[2]!);
    const lower2 = patternsForDay(days[3]!);

    expect(upper1.has("horizontal_push") || upper1.has("vertical_push")).toBe(true);
    expect(upper1.has("horizontal_pull") || upper1.has("vertical_pull")).toBe(true);
    expect(lower1.has("squat")).toBe(true);
    expect(lower1.has("hinge")).toBe(true);

    expect(upper2.has("horizontal_push") || upper2.has("vertical_push")).toBe(true);
    expect(upper2.has("horizontal_pull") || upper2.has("vertical_pull")).toBe(true);
    expect(lower2.has("squat")).toBe(true);
    expect(lower2.has("hinge")).toBe(true);
  });

  it("Full Body 3-day: each day contains at least one legs + one upper push/pull movement", () => {
    const prefs: CustomPlanPrefs = {
      goal: "performance",
      experience: "intermediate",
      focus: "full_body",
      daysPerWeek: 3,
      preferredDays: ["Mon", "Wed", "Fri"],
      timePerWorkout: "45",
      equipment: ["gym"],
      trainingStyle: "athletic",
    };
    const days = generateCustomPlanDaysFromLibrary(prefs);
    expect(days).toHaveLength(3);
    for (const d of days) {
      const patterns = patternsForDay(d);
      expect(patterns.has("squat") || patterns.has("hinge")).toBe(true);
      expect(patterns.has("horizontal_push") || patterns.has("vertical_push")).toBe(true);
      expect(patterns.has("horizontal_pull") || patterns.has("vertical_pull")).toBe(true);
    }
  });
});

describe("swap search", () => {
  it("returns meaningful alternatives for a common lift", () => {
    const bench = getExerciseByExactName("Barbell Bench Press");
    expect(bench).not.toBeNull();
    if (!bench) return;

    const alternatives = searchExercises({
      query: "bench",
      movementPattern: bench.movementPattern,
      equipment: new Set(["barbell", "dumbbell", "machine", "smith", "cables", "bodyweight"]),
      excludeIds: new Set([bench.id]),
      limit: 50,
    });

    // Should return multiple relevant options (incline bench, DB bench, machine press, etc.)
    expect(alternatives.length).toBeGreaterThanOrEqual(8);
  });
});

