// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/callable", () => {
  return { call: vi.fn().mockResolvedValue({ data: { ok: true } }) };
});

vi.mock("@/lib/firebase", () => {
  return {
    auth: { currentUser: { uid: "u1" } },
    db: {},
    getFirebaseConfig: () => ({ projectId: "test" }),
  };
});

let mockClaims: Record<string, unknown> = {};

vi.mock("firebase/auth", () => {
  return {
    onIdTokenChanged: (_auth: any, next: any) => {
      const mockUser = {
        uid: "u1",
        getIdTokenResult: async () => ({ claims: mockClaims }),
      };
      void next(mockUser);
      return () => {};
    },
  };
});

let userUnlimitedCreditsMirror = false;

vi.mock("firebase/firestore", () => {
  return {
    doc: (_db: any, ...segments: string[]) => {
      return { __path: segments.join("/") };
    },
    onSnapshot: (ref: any, next: any) => {
      const path = String(ref?.__path || "");
      if (path.endsWith("/private/credits")) {
        next({
          data: () => ({ creditsSummary: { totalAvailable: 3 } }),
          exists: () => true,
        });
      } else if (path === "users/u1") {
        next({
          data: () => ({ unlimitedCredits: userUnlimitedCreditsMirror }),
          exists: () => true,
        });
      } else {
        next({ data: () => ({}), exists: () => true });
      }
      return () => {};
    },
  };
});

import { useCredits } from "./useCredits";

describe("useCredits (unlimited credits)", () => {
  it("treats unlimitedCredits claim as unlimited credits (Infinity)", async () => {
    mockClaims = { unlimitedCredits: true };
    userUnlimitedCreditsMirror = false;
    const { result } = renderHook(() => useCredits());
    await waitFor(() => {
      expect(result.current.unlimited).toBe(true);
    });
    expect(result.current.credits).toBe(Infinity);
    expect(result.current.remaining).toBe(Infinity);
  });

  it("treats users/{uid}.unlimitedCredits mirror as unlimited credits (Infinity)", async () => {
    mockClaims = {};
    userUnlimitedCreditsMirror = true;
    const { result } = renderHook(() => useCredits());
    await waitFor(() => {
      expect(result.current.unlimited).toBe(true);
    });
    expect(result.current.credits).toBe(Infinity);
  });

  it("does not treat Pro entitlements as unlimited credits", async () => {
    mockClaims = {};
    userUnlimitedCreditsMirror = false;
    const { result } = renderHook(() => useCredits());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.unlimited).toBe(false);
    expect(result.current.credits).toBe(3);
  });
});

