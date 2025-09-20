import { describe, expect, it } from "vitest";
import { bmiFromKgCm, computeBodyFat, reconcileBodyFat, bfUsNavyFemale, bfUsNavyMale } from "../anthro";

describe("anthropometric estimators", () => {
  it("computes US Navy male estimate within expected bounds", () => {
    const bf = bfUsNavyMale(90, 40, 180);
    expect(bf).toBeCloseTo(25.1, 1);
  });

  it("computes US Navy female estimate within expected bounds", () => {
    const bf = bfUsNavyFemale(80, 34, 95, 165);
    expect(bf).toBeCloseTo(55.9, 1);
  });

  it("computes BMI from metric units", () => {
    const bmi = bmiFromKgCm(82, 180);
    expect(bmi).toBeCloseTo(25.3, 1);
  });

  it("reconciles estimates by averaging and clamping", () => {
    const merged = reconcileBodyFat(4, 80);
    expect(merged).toBe(65);
  });

  it("derives circumference-based body-fat results when data is available", () => {
    const result = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 40, waistCm: 90, weightKg: 82 });
    expect(result.method).toBe("photo");
    expect(Number.isFinite(result.bfPercent)).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("falls back to BMI estimate when circumferences missing", () => {
    const result = computeBodyFat({ sex: "female", heightCm: 165, weightKg: 70 });
    expect(result.method).toBe("bmi_fallback");
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.bfPercent).toBeGreaterThan(0);
  });
});
