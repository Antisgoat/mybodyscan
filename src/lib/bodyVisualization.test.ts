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
      },
    } as any);

    expect(profile.heightScale).toBeGreaterThan(1);
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
});
