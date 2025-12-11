// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuthBootstrap", () => ({
  useAuthBootstrap: () => {},
}));

vi.mock("@/hooks/useDemo", () => ({
  useDemoWireup: () => {},
}));

vi.mock("@/lib/claims", () => ({
  refreshClaimsAndAdminBoost: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/PolicyGate", () => ({
  default: () => null,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("./lib/auth")>("./lib/auth");
  return {
    ...actual,
    useAuthUser: () => ({ user: null, loading: false, authReady: true }) as const,
  };
});

import { AppProviders } from "./App";

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      value: () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
      writable: true,
    });
  }
});

describe("AppProviders", () => {
  it("renders the provider tree without crashing", () => {
    expect(() =>
      render(
        <AppProviders>
          <div />
        </AppProviders>,
      ),
    ).not.toThrow();
  });
});
