import { describe, expect, it } from "vitest";
import { matchVoiceExercise, parseVoiceWorkoutEntry } from "@/lib/voiceWorkout";

describe("voice workout logging", () => {
  it("parses a common weight-for-reps phrase", () => {
    expect(parseVoiceWorkoutEntry("bench press 225 for 8", "lb")).toEqual({
      exercise: "bench press",
      weight: 225,
      reps: 8,
      sets: null,
      unit: "lb",
      confidence: "high",
      transcript: "bench press 225 for 8",
    });
  });

  it("parses sets, reps, load, and explicit units", () => {
    expect(parseVoiceWorkoutEntry("squat 3 sets of 5 at 315 pounds")).toEqual({
      exercise: "squat",
      weight: 315,
      reps: 5,
      sets: 3,
      unit: "lb",
      confidence: "high",
      transcript: "squat 3 sets of 5 at 315 pounds",
    });
  });

  it("supports metric gym logging", () => {
    expect(parseVoiceWorkoutEntry("deadlift 180 kg x 5")).toMatchObject({
      exercise: "deadlift",
      weight: 180,
      reps: 5,
      unit: "kg",
    });
  });

  it("rejects ambiguous free-form speech instead of guessing", () => {
    expect(parseVoiceWorkoutEntry("bench felt pretty good today")).toBeNull();
  });

  it("matches a parsed phrase to the existing workout exercise", () => {
    const entry = parseVoiceWorkoutEntry("barbell bench press 225 for 8", "lb");
    expect(entry).not.toBeNull();
    const match = matchVoiceExercise(entry!, [
      { id: "bench", name: "Barbell Bench Press" },
      { id: "row", name: "Chest-Supported Row" },
    ]);
    expect(match?.id).toBe("bench");
  });
});
