// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth", () => {
  return {
    useAuthUser: () => ({ user: { uid: "u1" }, authReady: true }),
  };
});

vi.mock("@/components/DemoModeProvider", () => {
  return { useDemoMode: () => false };
});

vi.mock("@/lib/firebase", () => {
  return { db: {} };
});

vi.mock("@/lib/db/coachPaths", () => {
  return { coachPlanDoc: () => ({}) };
});

vi.mock("@/lib/dbWrite", () => {
  return { setDoc: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  let call = 0;
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    onSnapshot: vi.fn((_ref: any, onNext: any) => {
      call += 1;
      // 1) profile snapshot: missing doc
      // 2) plan snapshot: missing doc (this used to crash via `snap.exists` typo)
      onNext({
        exists: () => false,
        data: () => undefined,
      });
      return () => undefined;
    }),
  };
});

describe("useUserProfile boot safety", () => {
  it("missing coach plan/profile docs do not crash and return nulls", async () => {
    const { useUserProfile } = await import("./useUserProfile");
    function Probe() {
      const { profile, plan } = useUserProfile();
      return (
        <div>
          <div data-testid="profile">{profile ? "has" : "null"}</div>
          <div data-testid="plan">{plan ? "has" : "null"}</div>
        </div>
      );
    }

    render(<Probe />);
    expect(screen.getByTestId("profile").textContent).toBe("null");
    expect(screen.getByTestId("plan").textContent).toBe("null");
  });
});

