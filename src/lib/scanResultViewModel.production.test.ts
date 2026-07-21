import { describe, expect, it } from "vitest";
import { buildScanResultViewModel } from "./scanResultViewModel";
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
});
