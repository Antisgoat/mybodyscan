import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "@/pages/Auth";

vi.mock("@/auth/mbs-auth", () => ({
  signInEmailPassword: vi.fn(() => new Promise(() => {})),
  createAccountEmail: vi.fn(() => Promise.resolve()),
  sendReset: vi.fn(() => Promise.resolve()),
  startAuthListener: vi.fn(() => Promise.resolve()),
  signInGoogle: vi.fn(() => Promise.resolve()),
  signInApple: vi.fn(() => Promise.resolve()),
  useAuthUser: () => ({ user: null }),
}));

vi.mock("@/lib/firebase", () => ({
  firebaseConfigMissingKeys: [],
  firebaseConfigWarningKeys: [],
  getFirebaseInitError: () => null,
  getFirebaseConfig: () => ({}),
  hasFirebaseConfig: false,
}));

vi.mock("@/lib/firebaseAuthConfig", () => ({
  warnIfDomainUnauthorized: () => undefined,
}));

vi.mock("@/lib/firebase/runtimeConfig", () => ({
  getIdentityToolkitProbeStatus: () => ({ status: "ok" }),
  probeFirebaseRuntime: () =>
    Promise.resolve({ identityToolkit: { status: "ok" } }),
}));

vi.mock("@/lib/toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/network", () => ({
  checkOnline: () => Promise.resolve("online"),
}));

vi.mock("@/lib/auth/initAuth", () => ({
  getInitAuthState: () => ({
    started: false,
    completed: false,
    persistence: "unknown",
    redirectError: null,
    step: null,
    lastError: null,
    timedOut: false,
  }),
}));

vi.mock("@/lib/platform", () => ({
  isNativeCapacitor: () => false,
}));

vi.mock("@/lib/demoState", () => ({
  disableDemoEverywhere: () => undefined,
}));

vi.mock("@/state/demo", () => ({
  enableDemo: () => undefined,
}));

vi.mock("@/lib/telemetry", () => ({
  reportError: () => Promise.resolve(),
}));

describe("Auth sign-in timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).__MBS_NATIVE_RELEASE__ = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).__MBS_NATIVE_RELEASE__ = false;
  });

  it(
    "clears loading state and shows an error after timeout",
    async () => {
      render(
        <MemoryRouter initialEntries={["/auth"]}>
          <Auth />
        </MemoryRouter>
      );

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "password123" },
      });

      const submitButton = screen
        .getAllByRole("button", { name: /sign in/i })
        .find((button) => button.getAttribute("type") === "submit");
      if (!submitButton) {
        throw new Error("Submit button not found");
      }
      await act(async () => {
        fireEvent.click(submitButton);
      });

      expect((submitButton as HTMLButtonElement).disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const timeoutMessage = screen.getByText(/sign-in timed out/i);
      expect(timeoutMessage).toBeTruthy();
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    },
    10_000
  );
});
