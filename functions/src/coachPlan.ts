import { HttpsError, onCall } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase";

interface CoachProfile {
  goal?: string;
  activity_level?: string;
  style?: string;
  sex?: string;
  weight_kg?: number;
}

type SessionBlock = {
  title: string;
  focus: string;
  work: string[];
};

type SessionPlan = {
  day: string;
  blocks: SessionBlock[];
};

type GeneratedPlan = {
  days: number;
  split: string;
  sessions: SessionPlan[];
  progression: { deloadEvery: number };
  calorieTarget: number;
  proteinFloor: number;
  disclaimer: string;
  updatedAt: Timestamp;
};

const db = getFirestore();

function resolveDays(profile: CoachProfile | null): number {
  if (!profile) return 4;
  if (profile.style === "all_in") return 5;
  if (profile.activity_level === "sedentary") return 3;
  return 4;
}

function pickSplit(dayCount: number): string {
  if (dayCount <= 3) return "Push/Pull/Legs";
  if (dayCount === 4) return "Upper/Lower/Upper/Lower";
  return "Upper/Lower/Push/Pull/Legs";
}

function buildSessions(dayCount: number): SessionPlan[] {
  const base: SessionPlan[] = [
    {
      day: "Day 1",
      blocks: [
        {
          title: "Push Strength",
          focus: "Compound pressing and shoulders",
          work: [
            "Barbell Bench Press – 4×6 @ RPE 7-8",
            "Incline Dumbbell Press – 3×10 @ RPE 7",
            "Seated Dumbbell Shoulder Press – 3×10 @ RPE 7",
            "Cable Fly – 2×15 @ RPE 6",
            "Rope Tricep Pressdown – 3×12 @ RPE 7",
          ],
        },
      ],
    },
    {
      day: "Day 2",
      blocks: [
        {
          title: "Pull Strength",
          focus: "Back width and posterior chain",
          work: [
            "Conventional Deadlift – 3×5 @ RPE 8",
            "Chest-Supported Row – 3×10 @ RPE 7",
            "Lat Pulldown – 3×12 @ RPE 7",
            "Face Pull – 3×15 @ RPE 6",
            "EZ-Bar Curl – 3×12 @ RPE 7",
          ],
        },
      ],
    },
    {
      day: "Day 3",
      blocks: [
        {
          title: "Legs & Core",
          focus: "Squat pattern and unilateral work",
          work: [
            "Back Squat – 4×6 @ RPE 7-8",
            "Bulgarian Split Squat – 3×10/leg @ RPE 7",
            "Romanian Deadlift – 3×10 @ RPE 7",
            "Leg Curl – 3×15 @ RPE 6",
            "Hanging Knee Raise – 3×15 @ RPE 6",
          ],
        },
      ],
    },
    {
      day: "Day 4",
      blocks: [
        {
          title: "Upper Volume",
          focus: "Horizontal pulls and delts",
          work: [
            "Weighted Pull-Up – 4×6 @ RPE 8",
            "Single-Arm Dumbbell Row – 3×12/side @ RPE 7",
            "Incline Dumbbell Fly – 3×12 @ RPE 7",
            "Lateral Raise – 3×15 @ RPE 6",
            "Farmer Carry – 3×40m @ RPE 7",
          ],
        },
      ],
    },
    {
      day: "Day 5",
      blocks: [
        {
          title: "Conditioning & Glutes",
          focus: "GPP and posterior chain accessories",
          work: [
            "Sled Push – 6×20m @ RPE 7",
            "Kettlebell Swing – 4×12 @ RPE 7",
            "Hip Thrust – 3×12 @ RPE 7",
            "Reverse Lunge – 3×12/leg @ RPE 7",
            "Plank – 3×60s @ RPE 6",
          ],
        },
      ],
    },
  ];

  return base.slice(0, dayCount);
}

function estimateCalories(profile: CoachProfile | null): number {
  const baseWeight = profile?.weight_kg ?? 75;
  const maintenance = baseWeight * 32; // rough kcal estimate
  if (!profile) return Math.round(maintenance);
  switch (profile.goal) {
    case "lose_fat":
      return Math.round(maintenance * 0.85);
    case "gain_muscle":
      return Math.round(maintenance * 1.08);
    default:
      return Math.round(maintenance);
  }
}

function estimateProtein(profile: CoachProfile | null): number {
  const weightKg = profile?.weight_kg ?? 75;
  const weightLb = weightKg * 2.20462;
  return Math.round(weightLb * 0.9);
}

async function fetchProfile(uid: string): Promise<CoachProfile | null> {
  try {
    const snap = await db.doc(`users/${uid}/coach/profile`).get();
    if (!snap.exists) return null;
    return snap.data() as CoachProfile;
  } catch (err) {
    console.warn("coach_plan_profile_error", { uid, message: (err as any)?.message });
    return null;
  }
}

function buildPlan(profile: CoachProfile | null): GeneratedPlan {
  const days = resolveDays(profile);
  const split = pickSplit(days);
  const sessions = buildSessions(days);
  const calorieTarget = estimateCalories(profile);
  const proteinFloor = estimateProtein(profile);

  return {
    days,
    split,
    sessions,
    progression: { deloadEvery: 4 },
    calorieTarget,
    proteinFloor,
    disclaimer: "Training and nutrition guidance for education only – not medical advice.",
    updatedAt: Timestamp.now(),
  };
}

export const generatePlan = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to generate a plan");
  }

  const profile = await fetchProfile(uid);
  const plan = buildPlan(profile);

  await db.doc(`users/${uid}/coach/plan/current`).set(plan);

  return { plan: { ...plan, updatedAt: plan.updatedAt.toMillis() } };
});
