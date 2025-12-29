import { describe, it, expect } from "vitest";
import { round0, round1, weightKgToLb, weightLbToKg } from "./units";

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

