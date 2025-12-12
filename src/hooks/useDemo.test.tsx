// @vitest-environment jsdom

import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { BrowserRouter, useNavigate } from "react-router-dom";

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("useDemoWireup", () => {
  it("does not disable demo for signed-out users and does not re-subscribe on navigation", async () => {
    vi.resetModules();

    const onAuthStateChanged = vi.fn((_auth: any, cb: (user: any) => void) => {
      // Simulate Firebase immediately reporting the signed-out state.
      cb(null);
      return () => undefined;
    });

    vi.doMock("firebase/auth", () => ({ onAuthStateChanged }));
    vi.doMock("@/lib/firebase", () => ({ auth: { currentUser: null } }));

    // Ensure the module initializes with demo=1 in the real window location.
    window.history.replaceState({}, "", "/welcome?demo=1");

    const demoState = await import("@/state/demo");
    const { useDemoWireup } = await import("./useDemo");

    function Probe() {
      useDemoWireup();
      const navigate = useNavigate();
      useEffect(() => {
        // Force a navigation; the auth listener should NOT be re-subscribed.
        navigate("/home?demo=1", { replace: true });
      }, [navigate]);
      return null;
    }

    render(
      <BrowserRouter>
        <Probe />
      </BrowserRouter>
    );

    // Allow effects to run.
    await act(async () => {
      await flushMicrotasks();
      await flushMicrotasks();
    });

    // Demo should remain enabled (old behavior would have wiped it on signed-out auth callback).
    expect(demoState.isDemo()).toBe(true);

    // Listener should only be installed once.
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
  });
});
