import { describe, expect, it } from "vitest";
import {
  normalizePhysiqueScores,
  physiqueOverallScore,
  physiquePriorityAreas,
  physiqueStrengthAreas,
} from "@/lib/physiqueScores";

describe("physique development scores", () => {
  it("keeps only explicit supported numeric scores and clamps them safely", () => {
    expect(
      normalizePhysiqueScores({
        chest: 72.4,
        back: "81",
        shoulders: 104,
        arms: -4,
        core: null,
        legs: "not-a-score",
        inventedRegion: 99,
      })
    ).toEqual({ chest: 72, back: 81, shoulders: 100, arms: 0 });
  });

  it("never turns qualitative prose into a score", () => {
    expect(
      normalizePhysiqueScores({
        chest: "well developed",
        back: "priority area",
      })
    ).toEqual({});
  });

  it("identifies lowest and strongest explicit development areas", () => {
    const scores = {
      chest: 63,
      back: 78,
      shoulders: 81,
      arms: 69,
      core: 72,
      legs: 75,
    };
    expect(physiquePriorityAreas(scores, 2).map((item) => item.key)).toEqual([
      "chest",
      "arms",
    ]);
    expect(physiqueStrengthAreas(scores, 2).map((item) => item.key)).toEqual([
      "shoulders",
      "back",
    ]);
    expect(physiqueOverallScore(scores)).toBe(73);
  });

  it("does not publish an overall score from sparse data", () => {
    expect(physiqueOverallScore({ chest: 80, back: 70, legs: 75 })).toBeNull();
  });
});
