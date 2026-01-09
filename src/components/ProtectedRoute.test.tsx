// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockUser: any = null;
let mockAuthReady = false;

vi.mock("@/auth/facade", () => {
  return {
    useAuthUser: () => ({ user: mockUser, authReady: mockAuthReady }),
    useAuthPhase: () =>
      !mockAuthReady ? "booting" : mockUser ? "signedIn" : "signedOut",
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
    mockUser = null;
    mockAuthReady = false;
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

  it("does not redirect authenticated users back to /auth", () => {
    mockUser = { uid: "u1" };
    mockAuthReady = true;
    render(
      <MemoryRouter initialEntries={["/private"]}>
        <ProtectedRoute>
          <div>secret</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.queryByText("secret")).not.toBeNull();
  });
});

