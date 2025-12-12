// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DemoBanner from "./DemoBanner";

let mockUser: any = null;
let mockLoading = false;
vi.mock("@/lib/useAuthUser", () => ({
  useAuthUser: () => ({ user: mockUser, loading: mockLoading, authReady: true }),
}));

const mockIsDemoActive = vi.fn();
vi.mock("@/lib/demo", () => ({
  isDemoActive: () => mockIsDemoActive(),
}));

describe("DemoBanner", () => {
  const origEnv = { ...import.meta.env };

  afterEach(() => {
    (import.meta as any).env = { ...origEnv };
    vi.restoreAllMocks();
    cleanup();
    mockUser = null;
    mockLoading = false;
    mockIsDemoActive.mockReset();
  });

  it("shows when demo enabled and no user", () => {
    mockUser = null;
    mockIsDemoActive.mockReturnValue(true);
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).not.toBeNull();
  });

  it("hides after login even if demo enabled", () => {
    mockUser = { uid: "123" };
    mockIsDemoActive.mockReturnValue(false);
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });

  it("hides when demo disabled (regardless of auth)", () => {
    mockUser = null;
    mockIsDemoActive.mockReturnValue(false);
    render(<DemoBanner />);
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });
});
