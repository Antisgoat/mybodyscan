import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uid: "member-one" as string | undefined,
  snapshot: vi.fn(),
  save: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/auth/mbs-auth", () => ({
  useAuthUser: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => parts,
  onSnapshot: mocks.snapshot,
  serverTimestamp: () => "server-time",
}));
vi.mock("@/lib/dbWrite", () => ({ setDoc: mocks.save }));
import { useNutritionSafety } from "./useNutritionSafety";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uid = "member-one";
  mocks.snapshot.mockReturnValue(mocks.unsubscribe);
});
afterEach(cleanup);

it("reports unreadable preferences instead of treating them as no allergies", () => {
  const { result } = renderHook(useNutritionSafety);
  expect(result.current.loading).toBe(true);
  act(() => mocks.snapshot.mock.calls[0][2](new Error("offline")));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain("could not be loaded");
  act(() =>
    mocks.snapshot.mock.calls[0][1]({
      data: () => ({
        onboarding: {
          allergies: ["egg", "egg", "invalid"],
          allergyNotes: "Avoid egg",
        },
      }),
    })
  );
  expect(result.current.error).toBeNull();
  expect(result.current.preferences).toEqual({
    allergies: ["egg"],
    allergyNotes: "Avoid egg",
  });
});

it("clears the previous member's preferences when the account changes", () => {
  const { result, rerender } = renderHook(useNutritionSafety);
  act(() =>
    mocks.snapshot.mock.calls[0][1]({
      data: () => ({ onboarding: { allergies: ["peanuts"] } }),
    })
  );
  mocks.uid = "member-two";
  rerender();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  expect(result.current.loading).toBe(true);
  expect(result.current.preferences.allergies).toEqual([]);
  mocks.uid = undefined;
  rerender();
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});
