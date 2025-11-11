import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as FirebaseAuth from "firebase/auth";
import DemoBanner from "./DemoBanner";

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
}));

function mockOnAuthState(user: any) {
  vi.spyOn(FirebaseAuth, "onAuthStateChanged").mockImplementation((_auth: any, cb: any) => {
    cb(user);
    return () => {};
  });
}

describe("DemoBanner", () => {
  const origEnv = { ...import.meta.env };

  afterEach(() => {
    (import.meta as any).env = { ...origEnv };
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows when demo enabled and no user", () => {
    (import.meta as any).env = { ...origEnv, VITE_DEMO_MODE: "true" };
    mockOnAuthState(null);
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).not.toBeNull();
  });

  it("hides after login even if demo enabled", () => {
    (import.meta as any).env = { ...origEnv, VITE_DEMO_MODE: "true" };
    mockOnAuthState({ uid: "123" });
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });

  it("hides when demo disabled (regardless of auth)", () => {
    (import.meta as any).env = { ...origEnv, VITE_DEMO_MODE: "false" };
    mockOnAuthState(null);
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });
});
