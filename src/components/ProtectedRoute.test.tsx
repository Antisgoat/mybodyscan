// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/auth", () => {
  return {
    useAuthUser: () => ({ user: null, authReady: false }),
    useAuthPhase: () => "booting",
  };
});

vi.mock("@/lib/demo", () => {
  return { isDemoActive: () => false };
});

vi.mock("@/lib/demoFlag", () => {
  return { isPathAllowedInDemo: () => false };
});

vi.mock("./DemoModeProvider", () => {
  return { useDemoMode: () => false };
});

import ProtectedRoute from "./ProtectedRoute";

describe("ProtectedRoute", () => {
  it("waits for authReady before redirecting", () => {
    render(
      <MemoryRouter initialEntries={["/private"]}>
        <ProtectedRoute>
          <div>secret</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.queryByText("Checking your session…")).not.toBeNull();
    expect(screen.queryByText("secret")).toBeNull();
  });
});

