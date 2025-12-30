// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/entitlements/store", () => {
  return {
    useEntitlements: () => ({
      uid: "u1",
      entitlements: { pro: true, source: "iap", expiresAt: null },
      loading: false,
      error: null,
    }),
  };
});

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

vi.mock("firebase/auth", () => {
  return {
    onIdTokenChanged: (_auth: any, next: any) => {
      const mockUser = {
        uid: "u1",
        getIdTokenResult: async () => ({ claims: {} }),
      };
      void next(mockUser);
      return () => {};
    },
  };
});

vi.mock("firebase/firestore", () => {
  return {
    doc: () => ({}),
    onSnapshot: (_ref: any, next: any) => {
      next({
        data: () => ({ creditsSummary: { totalAvailable: 3 } }),
        exists: () => true,
      });
      return () => {};
    },
  };
});

import { useCredits } from "./useCredits";

describe("useCredits (pro entitlement)", () => {
  it("treats pro users as unlimited (credits Infinity)", async () => {
    const { result } = renderHook(() => useCredits());
    await waitFor(() => {
      expect(result.current.unlimited).toBe(true);
    });
    expect(result.current.credits).toBe(Infinity);
    expect(result.current.remaining).toBe(Infinity);
  });
});

