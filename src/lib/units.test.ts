import { describe, it, expect } from "vitest";
import { formatWeight, round0, round1, weightKgToLb, weightLbToKg } from "./units";

describe("units weight conversions", () => {
  it("converts 188 lb -> 85.3 kg (rounded to 1 decimal)", () => {
    const kg = weightLbToKg(188);
    expect(round1(kg)).toBeCloseTo(85.3, 5);
  });

  it("converts 85.3 kg -> 188 lb (rounded to 0 decimals)", () => {
    const lb = weightKgToLb(85.3);
    expect(round0(lb)).toBe(188);
  });
});

describe("formatWeight (canonical: stored kg)", () => {
  it("188 lb stored (as kg) shows 188 lb", () => {
    const storedKg = weightLbToKg(188);
    const formatted = formatWeight(storedKg, "lb", 0);
    expect(formatted.value).toBe(188);
    expect(formatted.label).toBe("lb");
  });

  it("85.3 kg stored + unit=lb shows 188 lb", () => {
    const formatted = formatWeight(85.3, "lb", 0);
    expect(formatted.value).toBe(188);
    expect(formatted.label).toBe("lb");
  });

  it("unit label always matches displayed numeric value", () => {
    const lbView = formatWeight(85.3, "lb", 1);
    const kgView = formatWeight(85.3, "kg", 1);
    expect(lbView.label).toBe("lb");
    expect(kgView.label).toBe("kg");
    expect(lbView.value).not.toBe(kgView.value);
  });
});

