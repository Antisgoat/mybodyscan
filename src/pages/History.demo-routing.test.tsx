// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/lib/useAuthUser", () => ({
  useAuthUser: () => ({ user: null, authReady: true }),
}));

vi.mock("@/components/DemoModeProvider", () => ({
  useDemoMode: () => true,
}));

vi.mock("@/hooks/useUnits", () => ({
  useUnits: () => ({ units: "us" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/demoDataset", () => ({
  demoScanHistory: [
    {
      id: "demo-scan-001",
      status: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      metrics: { bodyFatPct: 22.2, weightLb: 180.1, bmi: 25.1 },
    },
  ],
}));

vi.mock("@/lib/scanMedia", () => ({
  getFrontThumbUrl: async () => null,
}));

import HistoryPage from "@/pages/History";

describe("History page demo routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("demo signed-out 'Open' does not navigate to /auth", () => {
    render(
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/results/:scanId" element={<div data-testid="results-route" />} />
          <Route path="/auth" element={<div data-testid="auth-route" />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Open"));

    expect(screen.getByTestId("results-route")).toBeTruthy();
    expect(screen.queryByTestId("auth-route")).toBeNull();
  });
});

