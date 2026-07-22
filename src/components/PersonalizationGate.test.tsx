// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const gateState = vi.hoisted(() => ({
  demo: true,
  loading: true,
  personalizationCompleted: false,
}));

vi.mock("@/hooks/useOnboardingStatus", () => ({
  useOnboardingStatus: () => ({
    loading: gateState.loading,
    personalizationCompleted: gateState.personalizationCompleted,
  }),
}));

vi.mock("./DemoModeProvider", () => ({
  useDemoMode: () => gateState.demo,
}));

import PersonalizationGate from "./PersonalizationGate";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

describe("PersonalizationGate", () => {
  it("lets the read-only demo use sample feature pages without onboarding", () => {
    gateState.demo = true;
    gateState.loading = true;
    gateState.personalizationCompleted = false;

    render(
      <MemoryRouter initialEntries={["/meals?demo=1"]}>
        <PersonalizationGate>
          <div data-testid="demo-feature">Sample meals</div>
        </PersonalizationGate>
      </MemoryRouter>
    );

    expect(screen.getByTestId("demo-feature").textContent).toBe("Sample meals");
  });

  it("keeps incomplete real profiles on the onboarding path", () => {
    gateState.demo = false;
    gateState.loading = false;
    gateState.personalizationCompleted = false;

    render(
      <MemoryRouter initialEntries={["/meals"]}>
        <Routes>
          <Route
            path="/meals"
            element={
              <PersonalizationGate>
                <div>Real meals</div>
              </PersonalizationGate>
            }
          />
          <Route path="/onboarding" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("location").textContent).toBe(
      "/onboarding?returnTo=%2Fmeals"
    );
  });
});
