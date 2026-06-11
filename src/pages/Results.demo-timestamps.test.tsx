// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useUnits", () => ({
  useUnits: () => ({
    units: "us",
    loading: false,
    saving: false,
    error: null,
    setUnits: async () => {},
  }),
}));

vi.mock("@/hooks/useLatestScanForUser", () => ({
  useLatestScanForUser: () => ({
    scan: null,
    loading: false,
    error: null,
    user: null,
  }),
}));

vi.mock("@/lib/demoFlag", () => ({ isDemo: () => true }));

vi.mock("@/lib/demoDataset", () => ({
  demoMeals: {
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    meals: [],
  },
  demoLatestScan: {
    id: "demo-scan-missing-ts",
    status: "complete",
    // Intentionally omit createdAt/updatedAt/completedAt to prevent regressions like
    // "undefined is not an object (evaluating 'p.updatedAt')".
    input: { currentWeightKg: 81.7, heightCm: 180 },
    estimate: { bodyFatPercent: 20.1, bmi: 25.2, leanMassKg: 65.3 },
    nutritionPlan: {
      caloriesPerDay: 2200,
      proteinGrams: 165,
      carbsGrams: 220,
      fatsGrams: 73,
    },
    metrics: { bodyFatPct: 20.1, weightLb: 180.2, bmi: 25.1 },
    results: { bodyFatPct: 20.1, weightLb: 180.2, bmi: 25.1 },
  },
}));

vi.mock("@/components/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));

import Results from "@/pages/Results";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Results (demo timestamps)", () => {
  it("renders without throwing when timestamps are missing", () => {
    expect(() =>
      render(
        <MemoryRouter>
          <Results />
        </MemoryRouter>
      )
    ).not.toThrow();
    expect(screen.getByText("Your Body Scan")).toBeTruthy();
    expect(screen.getByText("20.1%")).toBeTruthy();
  });
});
