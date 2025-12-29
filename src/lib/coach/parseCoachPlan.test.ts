import { describe, expect, it } from "vitest";
import { parseCoachPlanDocData } from "@/lib/coach/parseCoachPlan";
import { weightLbToKg } from "@/lib/units";

describe("parseCoachPlanDocData", () => {
  it("does not throw when updatedAt is missing", () => {
    const plan = parseCoachPlanDocData({ days: 5, split: "PPL" });
    expect(plan.updatedAt).toBeNull();
  });

  it("normalizes updatedAt timestamp-like values to Date", () => {
    const plan = parseCoachPlanDocData({
      updatedAt: { toDate: () => new Date("2025-01-01T00:00:00Z") },
    });
    expect(plan.updatedAt instanceof Date).toBe(true);
    expect(plan.updatedAt?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("weight formatting regression", () => {
  it("188 lb displays as 188.0 lb when preferredUnit=lb (stored as kg)", async () => {
    const { formatWeight } = await import("@/lib/units");
    const kg = weightLbToKg(188);
    const formatted = formatWeight({ kg, preferredUnit: "lb", digits: 1 });
    expect(formatted.unitLabel).toBe("lb");
    expect(formatted.value).not.toBeNull();
    expect(formatted.value!).toBeCloseTo(188, 1);
  });

  it("85.3 kg displays as 85.3 kg when preferredUnit=kg", async () => {
    const { formatWeight } = await import("@/lib/units");
    const formatted = formatWeight({ kg: 85.3, preferredUnit: "kg", digits: 1 });
    expect(formatted.unitLabel).toBe("kg");
    expect(formatted.value).toBeCloseTo(85.3, 6);
  });
});

