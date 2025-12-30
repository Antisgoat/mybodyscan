// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("@/lib/auth", () => {
  return { useAuthUser: () => ({ user: null, authReady: true }) };
});

vi.mock("@/layouts/AuthedLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock("@/pages/Home", () => ({
  default: () => <div data-testid="demo-home">demo home</div>,
}));

import DemoGate from "@/pages/DemoGate";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("/demo route", () => {
  it("stays on /demo (does not redirect back to /auth)", () => {
    render(
      <MemoryRouter initialEntries={["/demo"]}>
        <Routes>
          <Route path="/demo" element={<DemoGate />} />
          <Route path="/auth" element={<div data-testid="auth-route" />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getByTestId("layout")).toBeTruthy();
    expect(screen.getByTestId("demo-home")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/demo");
    expect(screen.queryByTestId("auth-route")).toBeNull();
  });
});

