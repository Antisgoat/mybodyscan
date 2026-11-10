import { describe, expect, it } from "vitest";
import { exerciseAllowedByGymInventory } from "@/lib/gymEquipment";
import {
  calculateWorkoutVolume,
  formatSessionTime,
  inferMovementPattern,
  suggestExerciseSwaps,
} from "@/lib/workoutSession";

describe("workout session helpers", () => {
  it("offers same-pattern alternatives that fit confirmed gym equipment", () => {
    const inventory = ["dumbbells", "flat_bench"] as const;
    const swaps = suggestExerciseSwaps("Barbell Bent-Over Row", 6, inventory);
    expect(swaps.length).toBeGreaterThan(0);
    expect(
      swaps.every((exercise) =>
        exerciseAllowedByGymInventory(exercise, inventory)
      )
    ).toBe(true);
    expect(
      swaps.some((exercise) => exercise.equipment.includes("barbell"))
    ).toBe(false);
  });
  it("infers movement patterns and returns same-pattern swaps", () => {
    expect(inferMovementPattern("Dumbbell Bench Press")).toBe(
      "horizontal_push"
    );
    const swaps = suggestExerciseSwaps("Dumbbell Bench Press", 4);
    expect(swaps).toHaveLength(4);
    expect(
      swaps.every((exercise) => exercise.movementPattern === "horizontal_push")
    ).toBe(true);
  });

  it("formats countdown and elapsed time", () => {
    expect(formatSessionTime(0)).toBe("0:00");
    expect(formatSessionTime(125)).toBe("2:05");
  });

  it("normalizes mixed load units before totaling volume", () => {
    const result = calculateWorkoutVolume(
      [
        { id: "a", sets: 2 },
        { id: "b", sets: 1 },
      ],
      {
        a: { load: "100 lb", repsDone: "10" },
        b: { load: "45.359 kg", repsDone: "10" },
      },
      "us"
    );
    expect(result.value).toBeCloseTo(3000, -1);
    expect(result.unit).toBe("lb");
    expect(result.includedExercises).toBe(2);
  });
});
