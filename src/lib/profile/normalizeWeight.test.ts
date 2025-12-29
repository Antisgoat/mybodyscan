import { describe, expect, it } from "vitest";
import { normalizeWeightFields } from "./normalizeWeight";
import { weightLbToKg } from "@/lib/units";

describe("normalizeWeightFields (backward compatible)", () => {
  it("prefers explicit weightKg when present", () => {
    const out = normalizeWeightFields({ weightKg: 90, weight: 200, unit: "lb" });
    expect(out.weightKg).toBe(90);
    expect(out.unit).toBe("lb");
  });

  it("normalizes legacy weight with explicit unit", () => {
    const out = normalizeWeightFields({ weight: 188, unit: "lb" });
    expect(out.weightKg).toBeCloseTo(weightLbToKg(188), 6);
    expect(out.patch?.unit).toBe("lb");
  });

  it("heuristic: weight > 120 with no unit => treat as lb, default unit lb", () => {
    const out = normalizeWeightFields({ weight: 188 });
    expect(out.weightKg).toBeCloseTo(weightLbToKg(188), 6);
    expect(out.unit).toBe("lb");
    expect(out.patch?.unit).toBe("lb");
  });

  it("heuristic: weight <= 120 with no unit => treat as kg, default unit lb", () => {
    const out = normalizeWeightFields({ weight: 85.3 });
    expect(out.weightKg).toBeCloseTo(85.3, 6);
    // default display unit when missing
    expect(out.unit).toBe("lb");
  });
});

