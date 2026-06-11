import { describe, expect, it, vi, beforeEach } from "vitest";

const setDocMock = vi.fn(() => Promise.resolve());
const docMock = vi.fn((_: unknown, ...segments: string[]) => ({
  path: segments.join("/"),
}));
const generateWorkoutPlanMock = vi.fn(() =>
  Promise.resolve({ planId: "wp_123" })
);

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => docMock(...args),
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));
vi.mock("@/lib/dbWrite", () => ({
  setDoc: (...args: any[]) => setDocMock(...args),
}));
vi.mock("@/lib/workouts", () => ({
  generateWorkoutPlan: (...args: any[]) => generateWorkoutPlanMock(...args),
}));

describe("completeCoachOnboarding", () => {
  beforeEach(() => {
    setDocMock.mockClear();
    docMock.mockClear();
    generateWorkoutPlanMock.mockClear();
  });

  it("saves profile/coach plan and uses the deployed workout generation helper", async () => {
    const { completeCoachOnboarding } = await import(
      "./completeCoachOnboarding"
    );
    const result = await completeCoachOnboarding({
      user: { uid: "user_1" } as any,
      input: {
        goal: "lose_fat",
        timeframe_weeks: 2,
        transformation_intensity: "elite",
        sex: "male",
        age: 35,
        height_cm: 180,
        weight_kg: 90,
        activity_level: "moderate",
        training_days_per_week: 6,
        experience: "beginner",
        equipment: "full_gym",
        injuries: ["shoulder"],
        diet_preference: "high_protein",
      },
    });

    expect(generateWorkoutPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        daysPerWeek: 6,
        equipment: "gym",
        injuries: ["shoulder"],
      })
    );
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/user_1/coach/profile" }),
      expect.objectContaining({
        timeframe_weeks: 4,
        transformation_intensity: "aggressive",
        programPreferences: expect.objectContaining({
          focus: expect.not.stringMatching(/push_pull_legs/),
        }),
      }),
      { merge: true }
    );
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/user_1/coachPlans/current" }),
      expect.objectContaining({ workoutPlanId: "wp_123" }),
      { merge: true }
    );
    expect(result.workoutPlanId).toBe("wp_123");
  });
});
