import { describe, expect, it } from "vitest";
import { isAtTopOfRange, parseRepRange, progressionTip } from "@/lib/workoutsProgression";

describe("workouts progression helpers", () => {
  it("parses rep ranges", () => {
    expect(parseRepRange("6-10")).toEqual({ min: 6, max: 10 });
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 });
    expect(parseRepRange(" 8–12 ")).toEqual({ min: 8, max: 12 });
    expect(parseRepRange("30-45s")).toBeNull();
    expect(parseRepRange("")).toBeNull();
  });

  it("detects top-of-range", () => {
    expect(isAtTopOfRange({ targetReps: "6-10", repsDone: "10" })).toBe(true);
    expect(isAtTopOfRange({ targetReps: "6-10", repsDone: "9" })).toBe(false);
    expect(isAtTopOfRange({ targetReps: "10", repsDone: "10" })).toBe(true);
  });

  it("generates a reasonable tip string", () => {
    const tip = progressionTip({
      exerciseName: "Barbell Bench Press",
      targetReps: "6-10",
      repsDone: "10",
      rpe: 8,
    });
    expect(tip.toLowerCase()).toContain("progression");
    expect(tip).toContain("6-10");
  });
});

