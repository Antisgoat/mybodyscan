import { describe, it, expect } from "vitest";
import { normalizeScanMetrics } from "./scans";

describe("normalizeScanMetrics", () => {
  it("derives metrics from common result shapes", () => {
    const m = normalizeScanMetrics({ results: { bodyFatPercent: 18.234, weightKg: 80, bmi: 24.7 } } as any);
    expect(m.bodyFatPct).toBeCloseTo(18.2, 1);
    expect(m.weightLb).toBeGreaterThan(175);
    expect(m.bmi).toBeCloseTo(24.7, 1);
  });
});
