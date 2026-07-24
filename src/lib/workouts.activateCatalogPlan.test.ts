import { beforeEach, describe, expect, it, vi } from "vitest";

vi.useFakeTimers();

const fnJsonMock = vi.fn();

vi.mock("./fnCall", () => ({
  fnJson: (...args: any[]) => fnJsonMock(...args),
}));

vi.mock("@/lib/backend/callBackend", () => ({
  callRequestFunction: (...args: any[]) => fnJsonMock(...args),
}));

// Minimal firestore stubs used by activateCatalogPlan.
const getDocMock = vi.fn();
const docMock = vi.fn((_: any, ...rest: any[]) => {
  const path =
    rest.length === 1 && typeof rest[0] === "string" && rest[0].includes("/")
      ? rest[0]
      : rest.map((seg) => String(seg)).join("/");
  return { path };
});

vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => docMock(...args),
  getDoc: (...args: any[]) => getDocMock(...args),
  // Unused by these tests but imported by module
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./firebase", () => ({
  db: {},
}));

vi.mock("@/auth/mbs-auth", () => ({
  getCachedUser: () => ({ uid: "u1" }),
  requireIdToken: async () => "token",
}));

beforeEach(() => {
  fnJsonMock.mockReset();
  getDocMock.mockReset();
});

describe("activateCatalogPlan", () => {
  it("polls Firestore briefly until activation propagates", async () => {
    fnJsonMock.mockResolvedValue({ planId: "plan123" });

    let pollIndex = 0;
    getDocMock.mockImplementation(async (ref: any) => {
      const path = ref?.path as string;
      const makeSnap = (exists: boolean, data: any) => ({
        exists: () => exists,
        data: () => data,
      });
      if (path?.includes("workoutPlans_meta")) {
        pollIndex += 1;
        const activePlanId = pollIndex >= 3 ? "plan123" : "other";
        return makeSnap(true, { activePlanId });
      }
      if (path?.includes("workoutPlans/plan123")) {
        return makeSnap(pollIndex >= 3, { id: "plan123" });
      }
      return makeSnap(false, null);
    });

    const { activateCatalogPlan } = await import("./workouts");

    const promise = activateCatalogPlan(
      { programId: "p1", days: [{ day: "Mon", exercises: [{ name: "Squat", sets: 3, reps: "10" }] }] },
      { attempts: 1, confirmPolls: 5, backoffMs: 150 }
    );

    // advance sleeps for poll 0 and poll 1
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result.planId).toBe("plan123");
    expect(fnJsonMock).toHaveBeenCalled();
  });
});

describe("workout response validation", () => {
  it("rejects malformed generated workout days", async () => {
    fnJsonMock.mockResolvedValueOnce({
      planId: "plan123",
      days: [{ day: "Mon", exercises: null }],
    });
    const { generateWorkoutPlan } = await import("./workouts");

    await expect(generateWorkoutPlan()).rejects.toThrow(
      "workouts_generate_invalid_response"
    );
  });

  it("normalizes valid generated workout days", async () => {
    fnJsonMock.mockResolvedValueOnce({
      planId: "plan123",
      days: [
        {
          day: " Mon ",
          exercises: [
            { id: " squat ", name: " Back squat ", sets: 3, reps: " 8-10 " },
          ],
        },
      ],
    });
    const { generateWorkoutPlan } = await import("./workouts");

    await expect(generateWorkoutPlan()).resolves.toEqual({
      planId: "plan123",
      days: [
        {
          day: "Mon",
          exercises: [
            { id: "squat", name: "Back squat", sets: 3, reps: "8-10" },
          ],
        },
      ],
    });
  });

  it("uses the safe plan fallback for malformed current-plan payloads", async () => {
    fnJsonMock.mockResolvedValueOnce({
      id: "plan123",
      days: [null],
    });
    const { getPlan } = await import("./workouts");

    const result = await getPlan();
    expect(result.id).toBe("fallback-evidence-plan-v1");
    expect(result.days.length).toBeGreaterThan(0);
    expect(result.days.every((day) => Array.isArray(day.exercises))).toBe(true);
  });

  it("rejects malformed workout summaries without exposing them to the UI", async () => {
    fnJsonMock.mockResolvedValueOnce({
      planId: "plan123",
      days: [{ day: "Mon", exercises: [null] }],
      progress: {},
    });
    const { getWorkouts } = await import("./workouts");

    await expect(getWorkouts()).resolves.toBeNull();
  });
});
