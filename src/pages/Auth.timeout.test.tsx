// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Vite define shim used in production builds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__MBS_NATIVE_RELEASE__ = true;

const signInEmailPassword = vi.fn(
  () => new Promise(() => {})
);

vi.mock("@/auth/mbs-auth", () => ({
  createAccountEmail: vi.fn(),
  sendReset: vi.fn(),
  signInEmailPassword: (...args: any[]) => signInEmailPassword(...args),
  signInGoogle: vi.fn(),
  signInApple: vi.fn(),
  startAuthListener: vi.fn(),
  useAuthUser: () => ({ user: null }),
}));

vi.mock("@/auth/webAuth", () => ({
  finalizeRedirectResult: vi.fn().mockResolvedValue(null),
  webRequireAuth: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/network", () => ({
  checkOnline: vi.fn().mockResolvedValue("online"),
}));

vi.mock("@/lib/firebase", () => ({
  firebaseConfigMissingKeys: [],
  firebaseConfigWarningKeys: [],
  getFirebaseInitError: () => null,
  getFirebaseConfig: () => ({ projectId: "demo", authDomain: "demo" }),
  hasFirebaseConfig: () => true,
}));

vi.mock("@/lib/firebase/runtimeConfig", () => ({
  getIdentityToolkitProbeStatus: () => null,
  probeFirebaseRuntime: vi.fn().mockResolvedValue({ identityToolkit: null }),
}));

vi.mock("@/lib/firebaseAuthConfig", () => ({
  warnIfDomainUnauthorized: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/demoState", () => ({
  disableDemoEverywhere: vi.fn(),
}));

vi.mock("@/state/demo", () => ({
  enableDemo: vi.fn(),
}));

vi.mock("@/lib/auth/initAuth", () => ({
  getInitAuthState: () => ({ lastError: null }),
}));

vi.mock("@/lib/platform", () => ({
  isNativeCapacitor: () => false,
}));

import Auth from "@/pages/Auth";

describe("Auth email sign-in timeout", () => {
  afterEach(() => {
    signInEmailPassword.mockClear();
  });

  it(
    "shows a timeout error and clears loading when sign-in stalls",
    async () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "developer@adlerlabs.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "not-a-real-password" },
    });

    const signInButtons = screen.getAllByRole("button", { name: /^sign in$/i });
    const submitButton =
      signInButtons.find((button) => button.getAttribute("type") === "submit") ??
      signInButtons[0];
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(signInEmailPassword).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/sign-in timed out/i, undefined, {
        timeout: 30_000,
      })
    ).toBeTruthy();
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /^sign in$/i });
      const submit =
        buttons.find((button) => button.getAttribute("type") === "submit") ??
        buttons[0];
      expect(submit.getAttribute("disabled")).toBeNull();
    });
    },
    35_000
  );
});
