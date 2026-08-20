import { describe, expect, it } from "vitest";

import { getExerciseByExactName } from "@/lib/exercises/library";
import {
  deriveExerciseEquipment,
  exerciseAllowedByGymInventory,
  gymProfileEquipment,
  normalizeGymEquipment,
} from "@/lib/gymEquipment";
import { generateCustomPlanDaysFromLibrary } from "@/lib/workoutsCustomGenerator";
import type { CustomPlanPrefs } from "@/lib/workouts";
import { GYM_EQUIPMENT_IDS as SERVER_GYM_EQUIPMENT_IDS } from "../functions/src/gymEquipmentCatalog";
import { GYM_EQUIPMENT } from "@/lib/gymEquipment";

const BASE_PREFS: CustomPlanPrefs = {
  goal: "build_muscle",
  experience: "beginner",
  trainingStyle: "balanced",
  focus: "upper_lower",
  daysPerWeek: 4,
  preferredDays: ["Mon", "Tue", "Thu", "Fri"],
  timePerWorkout: "45",
  equipment: ["bodyweight"],
};

describe("confirmed gym inventory", () => {
  it("keeps the client checklist and server detector taxonomy identical", () => {
    expect(GYM_EQUIPMENT.map((item) => item.id)).toEqual(
      SERVER_GYM_EQUIPMENT_IDS
    );
  });

  it("normalizes unknown and duplicate detections without inventing equipment", () => {
    expect(
      normalizeGymEquipment([
        "dumbbells",
        "dumbbells",
        "squat_rack",
        "not_real",
      ])
    ).toEqual(["dumbbells", "squat_rack"]);
  });

  it("does not treat cardio machines as selectorized strength machines", () => {
    expect(deriveExerciseEquipment(["treadmill"])).toEqual(["bodyweight"]);
  });

  it("requires the exact strength machine instead of any generic machine", () => {
    const chestPress = getExerciseByExactName("Chest Press (Machine)");
    const legPress = getExerciseByExactName("Leg Press");
    expect(chestPress).not.toBeNull();
    expect(legPress).not.toBeNull();
    expect(exerciseAllowedByGymInventory(chestPress!, ["leg_press"])).toBe(
      false
    );
    expect(exerciseAllowedByGymInventory(legPress!, ["leg_press"])).toBe(true);
  });

  it("blocks rack and bench movements when those items are absent", () => {
    const squat = getExerciseByExactName("Barbell Back Squat");
    const bench = getExerciseByExactName("Dumbbell Bench Press");
    expect(exerciseAllowedByGymInventory(squat!, ["barbell"])).toBe(false);
    expect(exerciseAllowedByGymInventory(bench!, ["dumbbells"])).toBe(false);
    expect(
      exerciseAllowedByGymInventory(bench!, ["dumbbells", "flat_bench"])
    ).toBe(true);
  });

  it("never broadens a bodyweight-only generated plan to unavailable gear", () => {
    const days = generateCustomPlanDaysFromLibrary({
      ...BASE_PREFS,
      equipmentInventory: ["open_floor"],
    });
    expect(days).toHaveLength(4);
    for (const day of days) {
      expect(day.exercises.length).toBeGreaterThan(0);
      for (const item of day.exercises) {
        const exercise = getExerciseByExactName(item.name);
        expect(exercise, item.name).not.toBeNull();
        expect(exercise!.equipment).toContain("bodyweight");
      }
    }
  });

  it("uses bands and bodyweight when those are the only confirmed options", () => {
    const days = generateCustomPlanDaysFromLibrary({
      ...BASE_PREFS,
      equipment: ["bands", "bodyweight"],
      equipmentInventory: ["open_floor", "resistance_bands"],
    });
    const equipment = days.flatMap((day) =>
      day.exercises.flatMap(
        (item) => getExerciseByExactName(item.name)?.equipment ?? []
      )
    );
    expect(equipment).toContain("bands");
    expect(new Set(equipment)).toEqual(new Set(["bands", "bodyweight"]));
  });

  it("summarizes exact inventories without downgrading resistance setups", () => {
    expect(gymProfileEquipment(["open_floor"])).toBe("bodyweight");
    expect(gymProfileEquipment(["open_floor", "dumbbells"])).toBe("dumbbells");
    expect(gymProfileEquipment(["open_floor", "barbell", "squat_rack"])).toBe(
      "gym"
    );
    expect(gymProfileEquipment(["open_floor", "resistance_bands"])).toBe("gym");
  });
});
