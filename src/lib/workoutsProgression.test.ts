import { describe, expect, it } from "vitest";
import { formatLogSummary, isAtTopOfRange, isPR, parseLoad, parseRepRange, progressionTip } from "@/lib/workoutsProgression";

describe("workouts progression helpers", () => {
  it("parses rep ranges", () => {
    expect(parseRepRange("6-10")).toEqual({ min: 6, max: 10 });
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 });
    expect(parseRepRange(" 8–12 ")).toEqual({ min: 8, max: 12 });
    expect(parseRepRange("30-45s")).toBeNull();
    expect(parseRepRange("")).toBeNull();
  });

  it("parses loads", () => {
    expect(parseLoad("135lb")).toEqual({ value: 135, unit: "lb" });
    expect(parseLoad("60 kg")).toEqual({ value: 60, unit: "kg" });
    expect(parseLoad("")).toBeNull();
  });

  it("formats a log summary", () => {
    expect(formatLogSummary({ load: "135lb", repsDone: "10", rpe: 8 })).toContain("135lb");
    expect(formatLogSummary({ load: "135lb", repsDone: "10", rpe: 8 })).toContain("10 reps");
  });

  it("detects PRs", () => {
    expect(
      isPR({
        previous: { load: "135lb", repsDone: "8" },
        current: { load: "135lb", repsDone: "9" },
      })
    ).toBe(true);
    expect(
      isPR({
        previous: { load: "135lb", repsDone: "10" },
        current: { load: "140lb", repsDone: "6" },
      })
    ).toBe(true);
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

