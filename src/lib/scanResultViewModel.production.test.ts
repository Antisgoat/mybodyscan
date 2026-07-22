import { describe, expect, it } from "vitest";
import {
  buildScanComparisonViewModel,
  buildScanResultViewModel,
} from "./scanResultViewModel";
import type { ScanDocument } from "./api/scan";

const baseScan = (overrides: Partial<ScanDocument> = {}): ScanDocument =>
  ({
    id: "scan_1",
    uid: "user_1",
    status: "complete",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:01:00Z"),
    completedAt: new Date("2026-07-01T00:02:00Z"),
    resultSource: "ai",
    usedFallback: false,
    input: { currentWeightKg: 90, heightCm: 180 },
    estimate: { bodyFatPercent: 20, bmi: 27.8, leanMassKg: 72 } as any,
    nutritionPlan: {
      caloriesPerDay: 2300,
      proteinGrams: 180,
      carbsGrams: 230,
      fatsGrams: 65,
    } as any,
    photoPaths: {
      front: "scans/user_1/scan_1/front.jpg",
      back: "scans/user_1/scan_1/back.jpg",
      left: "scans/user_1/scan_1/left.jpg",
      right: "scans/user_1/scan_1/right.jpg",
    },
    ...overrides,
  }) as ScanDocument;

describe("scan result production view model", () => {
  it("treats fallback or timeout results as invalid and hides customer metrics", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        usedFallback: true,
        resultSource: "fallback",
        errorReason: "engine_timeout",
        errorInfo: { message: "provider stack trace" } as any,
      }),
    });

    expect(vm.isValidResult).toBe(false);
    expect(vm.isFailedOrFallback).toBe(true);
    expect(vm.primary.bodyFatPercent).toBeNull();
    expect(vm.primary.bmi).toBeNull();
    expect(vm.primary.leanMassKg).toBeNull();
    expect(vm.nutrition.available).toBe(false);
    expect(vm.failureTitle).toBe("We could not complete this scan");
    expect(vm.failureMessage).toContain("No estimate was created");
    expect(vm.failureMessage).not.toMatch(/engine|provider|stack|timeout/i);
  });

  it("shows only complete real analysis as a valid result", () => {
    const vm = buildScanResultViewModel({ scan: baseScan() });

    expect(vm.isValidResult).toBe(true);
    expect(vm.sourceLabel).toBe("AI analysis");
    expect(vm.primary.bodyFatPercent).toBe(20);
    expect(vm.primary.bmi).toBe(27.8);
    expect(vm.nutrition.calories).toBe(2300);
    expect(vm.nutrition.proteinGrams).toBe(180);
  });

  it("calculates fat and lean mass from weight and the photo estimate", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        input: { currentWeightKg: 80, heightCm: 180, goalWeightKg: 75 },
        estimate: { bodyFatPercent: 25, bmi: null } as any,
      }),
    });
    expect(vm.primary.fatMassKg).toBe(20);
    expect(vm.primary.leanMassKg).toBe(60);
  });

  it("omits BMI when height is missing", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        input: { currentWeightKg: 80, goalWeightKg: 75 },
        estimate: { bodyFatPercent: 25, bmi: null } as any,
      }),
    });
    expect(vm.primary.bmi).toBeNull();
  });

  it("does not trust provider-supplied BMI or mass values", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        input: { currentWeightKg: 80, heightCm: 200, goalWeightKg: 75 },
        estimate: {
          bodyFatPercent: 25,
          bmi: 99,
          fatMassKg: 2,
          leanMassKg: 78,
        } as any,
      }),
    });
    expect(vm.primary.bmi).toBe(20);
    expect(vm.primary.fatMassKg).toBe(20);
    expect(vm.primary.leanMassKg).toBe(60);
  });

  it("keeps a successful estimate valid when optional nutrition is absent", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({ nutritionPlan: null }),
    });
    expect(vm.isValidResult).toBe(true);
    expect(vm.isFailedOrFallback).toBe(false);
    expect(vm.nutrition.available).toBe(false);
  });

  it("drops visual observations that make diagnostic or injury claims", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        metrics: {
          postureObservation: "Possible scoliosis visible",
          balanceObservation: "No meaningful visible imbalance detected",
        },
      }),
    });
    expect(vm.observations).toEqual([
      {
        label: "Visible left/right balance",
        value: "No meaningful visible imbalance detected",
      },
    ]);
  });

  it("drops broader medical-condition language from visual observations", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        metrics: {
          postureObservation:
            "This posture indicates a painful spinal condition",
          muscularDevelopment: "Visible muscular development is balanced",
        },
      }),
    });
    expect(vm.observations).toEqual([
      {
        label: "Muscular development",
        value: "Visible muscular development is balanced",
      },
    ]);
  });

  it("drops regional measurements and internal-fat claims", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        metrics: {
          shouldersChest: "Visible development is balanced",
          torsoCore: "Approximately 18% fat in this region",
          hips: "Possible visceral fat pattern",
        },
      }),
    });
    expect(vm.regions).toEqual([
      {
        label: "Shoulders / chest",
        value: "Visible development is balanced",
      },
    ]);
  });

  it("retains a supported overall body-fat estimate range", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        estimate: {
          bodyFatPercent: 22,
          bodyFatRange: "20-24%",
          confidence: "moderate",
        } as any,
      }),
    });
    expect(vm.composition.estimateRange).toBe("20-24%");
    expect(vm.composition.confidence).toBe("moderate");
  });

  it("exposes qualitative regions but never maps unsupported BIA fields", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        metrics: {
          shouldersChest: "Strong development",
          legs: "Primary growth focus",
          visceralFat: 9,
          totalBodyWater: 42,
          biologicalAge: 31,
          segmentalLeanMassKg: { leftArm: 4.2 },
        },
      }),
    });
    expect(vm.regions).toEqual([
      { label: "Shoulders / chest", value: "Strong development" },
      { label: "Legs", value: "Primary growth focus" },
    ]);
    expect(JSON.stringify(vm)).not.toMatch(
      /visceral|bodyWater|biologicalAge|segmental/i
    );
  });

  it("surfaces canonical day targets and scan-specific progression details", () => {
    const vm = buildScanResultViewModel({
      scan: baseScan({
        nutritionPlan: {
          caloriesPerDay: 2300,
          proteinGrams: 180,
          carbsGrams: 230,
          fatsGrams: 65,
          fiberGrams: 32,
          trainingDay: {
            calories: 2450,
            proteinGrams: 180,
            carbsGrams: 270,
            fatsGrams: 65,
          },
          restDay: {
            calories: 2150,
            proteinGrams: 180,
            carbsGrams: 190,
            fatsGrams: 65,
          },
          adjustmentRules: [],
          sampleDay: [],
        } as any,
        workoutPlan: {
          summary: "Three-day full body",
          progressionRules: ["Add one rep before adding load."],
          weeks: [
            {
              weekNumber: 1,
              days: [
                {
                  day: "Monday",
                  focus: "Full body",
                  exercises: [{ name: "Goblet squat", sets: 3, reps: "8-12" }],
                },
              ],
            },
          ],
        },
      }),
    });

    expect(vm.nutrition.fiberGrams).toBe(32);
    expect(vm.nutrition.trainingDayCalories).toBe(2450);
    expect(vm.nutrition.restDayCalories).toBe(2150);
    expect(vm.plan.summary).toContain("Three-day full body");
    expect(vm.plan.progressionRules).toEqual([
      "Add one rep before adding load.",
    ]);
    expect(vm.plan.exercisePriorities).toEqual(["Goblet squat"]);
  });

  it("compares only valid scans and calculates defensible changes", () => {
    const previous = baseScan({
      id: "scan_previous",
      completedAt: new Date("2026-06-01T00:00:00Z"),
      input: { currentWeightKg: 100, heightCm: 180 },
      estimate: { bodyFatPercent: 25, bmi: 30.9 } as any,
      nutritionPlan: {
        caloriesPerDay: 2500,
        proteinGrams: 180,
        carbsGrams: 250,
        fatsGrams: 70,
      } as any,
    });
    const current = baseScan({
      id: "scan_current",
      completedAt: new Date("2026-07-01T00:00:00Z"),
      input: { currentWeightKg: 90, heightCm: 180 },
      estimate: { bodyFatPercent: 20, bmi: 27.8 } as any,
    });

    expect(buildScanComparisonViewModel(current, previous)).toEqual({
      previousScanId: "scan_previous",
      daysSincePrevious: 30,
      weightDeltaKg: -10,
      bodyFatDeltaPoints: -5,
      fatMassDeltaKg: -7,
      leanMassDeltaKg: -3,
      calorieTargetDelta: -200,
    });
    expect(
      buildScanComparisonViewModel(current, {
        ...previous,
        usedFallback: true,
        resultSource: "fallback",
      })
    ).toBeNull();
  });
});
