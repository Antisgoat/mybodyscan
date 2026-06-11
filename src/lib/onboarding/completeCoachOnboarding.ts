import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import { generateWorkoutPlan } from "@/lib/workouts";
import type { CustomPlanGoal } from "@/lib/workouts";
import type { ProgramPreferences } from "@/lib/programs/preferences";
import type { AuthUser } from "@/lib/auth/types";

export type CoachOnboardingInput = {
  goal?: string;
  style?: string;
  timeframe_weeks?: number;
  transformation_intensity?: string;
  sex?: string;
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  target_weight_kg?: number;
  target_body_fat_pct?: number;
  visual_goal?: string;
  activity_level?: string;
  training_days_per_week?: number;
  experience?: string;
  equipment?: string;
  injuries?: string[];
  diet_preference?: string;
  medical_flags?: Record<string, boolean>;
  ack?: Record<string, boolean>;
  units?: string;
  height_ft?: number;
  height_in?: number;
  weight_lb?: number;
};

export type CompletedOnboardingPlan = {
  days: number;
  split: string;
  sessions: Array<{
    day: string;
    blocks: Array<{ title: string; focus: string; work: string[] }>;
  }>;
  progression: { deloadEvery: number };
  calorieTarget: number;
  proteinFloor: number;
  carbsGrams: number;
  fatGrams: number;
  tdee: number | null;
  bmr: number | null;
  workoutPlanId: string | null;
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weight_lb?: number;
  height_ft?: number;
  height_in?: number;
  disclaimer: string;
};

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeString(
  value: unknown,
  allowed: string[],
  fallback: string
): string {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}

function sanitizeInjuries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set([
    "shoulder",
    "knee",
    "lower_back",
    "hip",
    "wrist_elbow",
    "other",
  ]);
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(
      (item, index, arr) =>
        item && allowed.has(item) && arr.indexOf(item) === index
    )
    .slice(0, 6);
}

function goalForNutrition(
  goal: string
): "lose_fat" | "gain_muscle" | "maintain" | "recomp" {
  if (goal === "lose_fat") return "lose_fat";
  if (goal === "gain_muscle") return "gain_muscle";
  if (goal === "recomp") return "recomp";
  return "maintain";
}

function goalForWorkout(goal: string): CustomPlanGoal {
  if (goal === "lose_fat") return "lose_fat";
  if (goal === "gain_muscle") return "build_muscle";
  if (goal === "improve_heart") return "performance";
  return "recomp";
}

function goalForProgram(goal: string): ProgramPreferences["goal"] {
  if (goal === "lose_fat") return "fat_loss";
  if (goal === "gain_muscle") return "hypertrophy";
  if (goal === "improve_heart") return "athletic";
  return "hypertrophy";
}

function equipmentForProgram(
  equipment: string
): ProgramPreferences["equipment"] {
  if (equipment === "dumbbells") return "dumbbells";
  if (equipment === "bodyweight" || equipment === "bands") return "bodyweight";
  return "full_gym";
}

function focusForProgram(params: {
  days: number;
  experience: string;
  equipment: string;
  injuries: string[];
}): ProgramPreferences["focus"] {
  const injuryConflict = params.injuries.some((item) =>
    ["shoulder", "lower_back", "knee", "hip"].includes(item)
  );
  const canPpl =
    params.days === 6 &&
    params.experience !== "beginner" &&
    params.equipment === "full_gym" &&
    !injuryConflict;
  if (canPpl) return "push_pull_legs";
  if (params.days >= 4 && !injuryConflict) return "upper_lower";
  return "full_body";
}

function equipmentForWorkout(equipment: string): string[] {
  if (equipment === "full_gym")
    return ["gym", "dumbbells", "machines", "barbell", "cables"];
  if (equipment === "home_gym") return ["dumbbells", "bands", "bodyweight"];
  if (equipment === "machines") return ["machines", "dumbbells"];
  return [equipment];
}

export function normalizeCoachOnboardingInput(input: CoachOnboardingInput) {
  const goal = sanitizeString(
    input.goal,
    ["lose_fat", "gain_muscle", "improve_heart", "recomp", "maintain"],
    "lose_fat"
  );
  const timeframeWeeks = clampNumber(input.timeframe_weeks, 4, 52, 12);
  const transformationIntensity = sanitizeString(
    input.transformation_intensity,
    ["balanced", "aggressive", "elite"],
    input.style === "all_in" ? "aggressive" : "balanced"
  );
  const sex = sanitizeString(
    input.sex,
    ["male", "female", "other", "unspecified"],
    "unspecified"
  );
  const age = clampNumber(input.age, 13, 100, 30);
  const heightCm = clampNumber(input.height_cm, 90, 260, 170);
  const weightKgRaw = Number(input.weight_kg);
  const weightKg = Number.isFinite(weightKgRaw)
    ? Math.max(30, Math.min(300, weightKgRaw))
    : 70;
  const targetWeightKgRaw = Number(input.target_weight_kg);
  const targetWeightKg =
    Number.isFinite(targetWeightKgRaw) && targetWeightKgRaw > 0
      ? Math.max(30, Math.min(300, targetWeightKgRaw))
      : undefined;
  const targetBodyFatRaw = Number(input.target_body_fat_pct);
  const targetBodyFatPct =
    Number.isFinite(targetBodyFatRaw) && targetBodyFatRaw > 0
      ? Math.max(5, Math.min(60, targetBodyFatRaw))
      : undefined;
  const activityLevel = sanitizeString(
    input.activity_level,
    ["sedentary", "light", "moderate", "very", "extra"],
    "light"
  );
  const trainingDays = clampNumber(input.training_days_per_week, 2, 6, 3);
  const experience = sanitizeString(
    input.experience,
    ["beginner", "intermediate", "advanced"],
    "beginner"
  );
  const equipment = sanitizeString(
    input.equipment,
    ["full_gym", "home_gym", "dumbbells", "bands", "bodyweight", "machines"],
    "full_gym"
  );
  const injuries = sanitizeInjuries(input.injuries);
  const dietPreference = sanitizeString(
    input.diet_preference,
    [
      "balanced",
      "high_protein",
      "low_carb",
      "keto",
      "vegetarian",
      "vegan",
      "gluten_free",
      "lactose_free",
    ],
    "balanced"
  );
  const visualGoal =
    typeof input.visual_goal === "string"
      ? input.visual_goal.trim().slice(0, 120)
      : undefined;
  return {
    ...input,
    goal,
    timeframe_weeks: timeframeWeeks,
    transformation_intensity:
      transformationIntensity === "elite" && timeframeWeeks < 12
        ? "aggressive"
        : transformationIntensity,
    style: transformationIntensity === "balanced" ? "ease_in" : "all_in",
    sex,
    age,
    height_cm: heightCm,
    heightCm,
    weight_kg: weightKg,
    weightKg,
    target_weight_kg: targetWeightKg,
    target_body_fat_pct: targetBodyFatPct,
    visual_goal: visualGoal,
    activity_level: activityLevel,
    training_days_per_week: trainingDays,
    experience,
    equipment,
    injuries,
    diet_preference: dietPreference,
  };
}

export function buildProgramPreferencesFromOnboarding(
  profile: ReturnType<typeof normalizeCoachOnboardingInput>
): ProgramPreferences {
  const days = Math.max(
    3,
    Math.min(6, profile.training_days_per_week)
  ) as ProgramPreferences["daysPerWeek"];
  return {
    daysPerWeek: days,
    goal: goalForProgram(profile.goal),
    equipment: equipmentForProgram(profile.equipment),
    experience: profile.experience as ProgramPreferences["experience"],
    timePerWorkout: 45,
    focus: focusForProgram({
      days: profile.training_days_per_week,
      equipment: profile.equipment,
      experience: profile.experience,
      injuries: profile.injuries,
    }),
  };
}

function buildCoachSessions(days: number, injuries: string[]) {
  const safety = injuries.length
    ? `Avoid aggravating ${injuries.map((item) => item.replace(/_/g, " ")).join(", ")}; use pain-free substitutions.`
    : "Use pain-free ranges and stop sets when form breaks.";
  return [
    {
      day: "Strength A",
      blocks: [
        {
          title: "Full-body strength",
          focus: "Squat, push, pull, hinge",
          work: [
            "Warm-up: 5-8 min easy cardio + dynamic hips/shoulders",
            "Squat pattern — 3-4×6-10 @ RPE 7",
            "Horizontal push — 3-4×6-12 @ RPE 7",
            "Horizontal pull — 3-4×8-12 @ RPE 7",
            safety,
          ],
        },
      ],
    },
    {
      day: "Strength B",
      blocks: [
        {
          title: "Posterior chain + upper",
          focus: "Hinge, unilateral legs, vertical pull/push",
          work: [
            "Warm-up: 5-8 min easy cardio + bracing practice",
            "Hip hinge — 3×6-10 @ RPE 7",
            "Split squat or step-up — 3×8-12/side @ RPE 7",
            "Vertical pull — 3×8-12 @ RPE 7",
            "Progress when all sets hit the top of the rep range with 1-3 reps in reserve.",
          ],
        },
      ],
    },
    {
      day: "Conditioning",
      blocks: [
        {
          title: "Zone 2 + core",
          focus: "Cardio base, steps, trunk stability",
          work: [
            "Zone 2 cardio — 25-40 min conversational pace",
            "Carry or plank variation — 3×30-60s",
            "Daily steps target: 7,000-10,000 unless recovery says otherwise",
          ],
        },
      ],
    },
  ].slice(0, Math.max(2, Math.min(days, 3)));
}

export async function completeCoachOnboarding(params: {
  user: AuthUser;
  input: CoachOnboardingInput;
}): Promise<CompletedOnboardingPlan> {
  const { user } = params;
  const profile = normalizeCoachOnboardingInput(params.input);
  const programPreferences = buildProgramPreferencesFromOnboarding(profile);
  const goals = deriveNutritionGoals({
    weightKg: profile.weight_kg,
    goal: goalForNutrition(profile.goal),
    goalWeightKg: profile.target_weight_kg ?? null,
    activityLevel: profile.activity_level as any,
    sex: profile.sex as any,
    age: profile.age,
    heightCm: profile.height_cm,
  });

  const now = serverTimestamp();
  const profileRef = doc(db, "users", user.uid, "coach", "profile");
  const planRef = doc(db, "users", user.uid, "coachPlans", "current");
  const metaRef = doc(db, "users", user.uid, "meta", "onboarding");
  const userRef = doc(db, "users", user.uid);

  const basePlan = {
    days: profile.training_days_per_week,
    split:
      programPreferences.focus === "upper_lower"
        ? "Upper / Lower"
        : programPreferences.focus === "push_pull_legs"
          ? "Push / Pull / Legs"
          : "Full Body + Conditioning",
    sessions: buildCoachSessions(
      profile.training_days_per_week,
      profile.injuries
    ),
    progression: {
      deloadEvery: profile.transformation_intensity === "elite" ? 6 : 4,
    },
    calorieTarget: goals.calories,
    proteinFloor: goals.proteinGrams,
    carbsGrams: goals.carbsGrams,
    fatGrams: goals.fatGrams,
    tdee: goals.tdee,
    bmr: goals.bmr,
    disclaimer: "Fitness and nutrition guidance only — not medical advice.",
    source: "onboarding",
    updatedAt: now,
  };

  await Promise.all([
    setDoc(
      profileRef,
      { ...profile, programPreferences, updatedAt: now },
      { merge: true }
    ),
    setDoc(planRef, basePlan, { merge: true }),
    setDoc(
      metaRef,
      { completed: true, completedAt: now, updatedAt: now, version: 2 },
      { merge: true }
    ),
    setDoc(
      userRef,
      {
        onboarding: {
          age: profile.age,
          sex: profile.sex === "unspecified" ? "other" : profile.sex,
          height: profile.height_cm,
          goal:
            profile.goal === "lose_fat"
              ? "lose-fat"
              : profile.goal === "gain_muscle"
                ? "gain-muscle"
                : profile.goal === "recomp"
                  ? "recomp"
                  : "maintain",
          timeline: Math.max(
            1,
            Math.min(36, Math.round(profile.timeframe_weeks / 4))
          ),
          equipment:
            profile.equipment === "bodyweight"
              ? "bodyweight"
              : profile.equipment === "home_gym"
                ? "home-basic"
                : profile.equipment === "full_gym" ||
                    profile.equipment === "machines"
                  ? "gym"
                  : "home-basic",
          injuries: profile.injuries.join(", "),
          experience: profile.experience,
          diet:
            profile.diet_preference === "low_carb"
              ? "low-carb"
              : profile.diet_preference === "vegetarian" ||
                  profile.diet_preference === "vegan" ||
                  profile.diet_preference === "keto"
                ? profile.diet_preference
                : "balanced",
          completedAt: now,
          version: 2,
        },
        onboardingCompleted: true,
      },
      { merge: true }
    ),
  ]);

  let workoutPlanId: string | null = null;
  const workout = await generateWorkoutPlan({
    daysPerWeek: profile.training_days_per_week,
    equipment:
      profile.equipment === "bodyweight"
        ? "none"
        : profile.equipment === "full_gym" || profile.equipment === "machines"
          ? "gym"
          : profile.equipment,
    focus: "full",
    injuries: profile.injuries,
    goal: goalForWorkout(profile.goal),
    experience: profile.experience,
    trainingStyle:
      programPreferences.focus === "push_pull_legs"
        ? "hypertrophy"
        : "balanced",
    preferredDays: undefined,
    equipmentList: equipmentForWorkout(profile.equipment),
  });
  workoutPlanId =
    typeof (workout as any)?.planId === "string"
      ? (workout as any).planId
      : null;
  if (workoutPlanId) {
    await setDoc(
      planRef,
      { workoutPlanId, workoutGeneratedAt: serverTimestamp() },
      { merge: true }
    );
  }

  return {
    ...basePlan,
    updatedAt: new Date(),
    workoutPlanId,
    target_kcal: goals.calories,
    protein_g: goals.proteinGrams,
    carbs_g: goals.carbsGrams,
    fat_g: goals.fatGrams,
    weight_lb: params.input.weight_lb,
    height_ft: params.input.height_ft,
    height_in: params.input.height_in,
  } as unknown as CompletedOnboardingPlan;
}
