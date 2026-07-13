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
});
