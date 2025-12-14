import { describe, expect, it, vi } from "vitest";

vi.useFakeTimers();

const fnJsonMock = vi.fn();

vi.mock("./fnCall", () => ({
  fnJson: (...args: any[]) => fnJsonMock(...args),
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
  auth: {
    currentUser: {
      uid: "u1",
      getIdToken: vi.fn(async () => "token"),
    },
  },
  db: {},
}));

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

