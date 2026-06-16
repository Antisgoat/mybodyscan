// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockUnits: "us" | "metric" = "us";
vi.mock("@/hooks/useUnits", () => ({
  useUnits: () => ({
    units: mockUnits,
    loading: false,
    saving: false,
    error: null,
    setUnits: async () => {},
  }),
}));

let mockLatest: any = null;
vi.mock("@/hooks/useLatestScanForUser", () => ({
  useLatestScanForUser: () => mockLatest,
}));

vi.mock("@/lib/demoFlag", () => ({ isDemo: () => false }));
vi.mock("@/lib/demoDataset", () => ({
  demoLatestScan: null,
  demoMeals: {
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    meals: [],
  },
}));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: null, plan: null }),
}));
vi.mock("@/lib/entitlements/store", () => ({
  useEntitlements: () => ({ entitlements: null }),
}));
vi.mock("@/components/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));

import Results from "./Results";

afterEach(() => {
  cleanup();
  mockUnits = "us";
  mockLatest = null;
  vi.restoreAllMocks();
});

describe("Results page weight units", () => {
  it("renders an empty state for signed-in users with no scans (no crash)", () => {
    mockUnits = "us";
    mockLatest = {
      scan: null,
      loading: false,
      error: null,
      user: { uid: "user_1" },
    };

    render(
      <MemoryRouter>
        <Results />
      </MemoryRouter>
    );

    expect(screen.getByText(/Unable to load results/i)).toBeTruthy();
    expect(screen.getByText(/Start a Scan/i)).toBeTruthy();
  });

  it("renders stored 85.3 kg as ~188 lb when preferred unit is lb/us", () => {
    mockUnits = "us";
    mockLatest = {
      scan: {
        id: "scan_1",
        status: "complete",
        createdAt: new Date(),
        input: { currentWeightKg: 85.3, heightCm: 180 },
        nutritionPlan: { caloriesPerDay: 2200, proteinGrams: 170, carbsGrams: 220, fatsGrams: 70 },
        // Simulate the legacy bug shape: ambiguous `weight` holds kg, not lb.
        metrics: { weightKg: 85.3, weight: 85.3 },
        estimate: { bodyFatPercent: 18.2, bmi: 26.3, leanMassKg: 69.8 },
      },
      loading: false,
      error: null,
      user: { uid: "user_1" },
    };

    render(
      <MemoryRouter>
        <Results />
      </MemoryRouter>
    );

    expect(screen.getByText(/Weight/i)).toBeTruthy();
    expect(screen.getByText(/188\.1 lb/)).toBeTruthy();
    expect(screen.queryByText(/85\.3 lb/)).toBeNull();
  });

  it("never prints a raw kg value with an lb label in us mode", () => {
    mockUnits = "us";
    mockLatest = {
      scan: {
        id: "scan_2",
        status: "complete",
        createdAt: new Date(),
        input: { currentWeightKg: 85.3, heightCm: 180 },
        nutritionPlan: { caloriesPerDay: 2200, proteinGrams: 170, carbsGrams: 220, fatsGrams: 70 },
        estimate: { bodyFatPercent: 18.2, bmi: 26.3, leanMassKg: 69.8 },
        metrics: { weightKg: 85.3, weightLb: 85.3 },
      },
      loading: false,
      error: null,
      user: { uid: "user_1" },
    };

    render(
      <MemoryRouter>
        <Results />
      </MemoryRouter>
    );

    expect(screen.queryByText(/85\.3 lb/)).toBeNull();
  });
});

