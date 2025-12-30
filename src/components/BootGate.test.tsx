// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const initAuth = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/initAuth", () => ({ initAuth: (...a: any[]) => initAuth(...a) }));

const probeFirebaseRuntime = vi.fn().mockResolvedValue({ identityToolkit: null });
vi.mock("@/lib/firebase/runtimeConfig", () => ({
  probeFirebaseRuntime: (...a: any[]) => probeFirebaseRuntime(...a),
}));

const logFirebaseConfigSummary = vi.fn();
const logFirebaseRuntimeInfo = vi.fn();
vi.mock("@/lib/firebase", () => ({
  logFirebaseConfigSummary: (...a: any[]) => logFirebaseConfigSummary(...a),
  logFirebaseRuntimeInfo: (...a: any[]) => logFirebaseRuntimeInfo(...a),
}));

import { BootGate } from "@/components/BootGate";

describe("BootGate", () => {
  it("renders children after initAuth completes", async () => {
    render(
      <BootGate>
        <div data-testid="ready">ready</div>
      </BootGate>
    );

    expect(screen.queryByTestId("ready")).toBeNull();
    expect(screen.getByText(/loading/i)).toBeTruthy();

    expect(await screen.findByTestId("ready")).toBeTruthy();
    expect(initAuth).toHaveBeenCalledTimes(1);
  });

  it("shows 'Completing sign-in…' when a pending oauth marker exists", () => {
    window.sessionStorage.setItem("mybodyscan:auth:oauth:pending", "{}");
    render(
      <BootGate>
        <div data-testid="ready">ready</div>
      </BootGate>
    );
    expect(screen.getByText("Completing sign-in…")).toBeTruthy();
  });
});

