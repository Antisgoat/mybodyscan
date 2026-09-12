import { describe, expect, it } from "vitest";
import { buildParametricBodyProfile } from "@/lib/bodyVisualization";
import type { CanonicalScanResultViewModel } from "@/lib/scanResultViewModel";

const vm = {
  primary: { bmi: 31, bodyFatPercent: 28 },
  composition: { heightCm: 183 },
  regions: [{ label: "Arms", value: "Balanced visible development" }],
} as CanonicalScanResultViewModel;

describe("buildParametricBodyProfile", () => {
  it("builds bounded proportions and preserves supported region insights", () => {
    const profile = buildParametricBodyProfile(vm, {
      estimate: {
        physiqueScores: { chest: 8, shoulders: 7, arms: 6, core: 5, legs: 7 },
        visualProportions: {
          shoulderWidthToHeight: 0.3,
          waistWidthToHeight: 0.24,
          torsoDepthToHeight: 0.19,
          hipDepthToHeight: 0.2,
          armLengthToHeight: 0.36,
          calfWidthToHeight: 0.06,
          legLengthToHeight: 0.52,
          torsoLengthToHeight: 0.35,
          neckWidthToHeight: 0.09,
          headWidthToHeight: 0.14,
        },
      },
    } as any);

    expect(profile.heightScale).toBeGreaterThan(1);
    expect(profile.shoulderScale).toBeCloseTo(1.2);
    expect(profile.depthScale).toBeCloseTo(1.1875);
    expect(profile.hipDepthScale).toBeCloseTo(1.1765, 3);
    expect(profile.armLengthScale).toBeCloseTo(1.0909, 3);
    expect(profile.legLengthScale).toBeCloseTo(1.0612, 3);
    expect(profile.torsoLengthScale).toBeCloseTo(1.09375, 3);
    expect(profile.calfScale).toBeCloseTo(1.0909, 3);
    expect(profile.neckScale).toBeCloseTo(1.0588, 3);
    expect(profile.headScale).toBeCloseTo(1.0769, 3);
    expect(profile.waistScale).toBeGreaterThan(1);
    expect(profile.waistScale).toBeLessThanOrEqual(1.42);
    expect(profile.regions.find((region) => region.id === "arms")?.value).toBe(
      "Balanced visible development"
    );
  });

  it("uses neutral defaults when optional measurements are unavailable", () => {
    const profile = buildParametricBodyProfile(
      { ...vm, primary: {} as any, composition: {} as any, regions: [] },
      {} as any
    );

    expect(profile.heightScale).toBe(1);
    expect(profile.regions).toHaveLength(5);
    Object.values(profile)
      .filter((value) => typeof value === "number")
      .forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });

  it("falls back to supported metrics when photo proportions are low confidence", () => {
    const profile = buildParametricBodyProfile(vm, {
      estimate: {
        visualProportions: {
          shoulderWidthToHeight: 0.3,
          waistWidthToHeight: 0.24,
          torsoDepthToHeight: 0.19,
          confidence: 0.35,
        },
      },
    } as any);

    expect(profile.source).toBe("metric_estimate");
    expect(profile.proportionConfidence).toBe(0.35);
    expect(profile.shoulderScale).not.toBeCloseTo(1.2);
  });
});
