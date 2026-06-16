import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/auth/mbs-auth";
import { setDoc } from "@/lib/dbWrite";
import { generateWorkoutPlan } from "@/lib/workouts";
import { deriveNutritionGoals, type NutritionGoal } from "@/lib/nutritionGoals";
import {
  normalizeProgramPreferences,
  type ProgramPreferences,
} from "@/lib/programs/preferences";
import { cmToIn, inToFtIn, kgToLb } from "@/lib/units";

type RawCoachOnboarding = Record<string, unknown>;

const asNumber = (value: unknown, fallback?: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = asNumber(value, fallback) ?? fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
      .slice(0, 12);
  }
  const single = asString(value);
  return single ? [single] : [];
};

function nutritionGoalFromRaw(goal: string): NutritionGoal {
  if (goal === "lose_fat") return "lose_fat";
  if (goal === "gain_muscle") return "gain_muscle";
  if (goal === "recomp") return "recomp";
  return "maintain";
}

function toProgramPreferences(raw: RawCoachOnboarding): ProgramPreferences {
  const goal = asString(raw.goal, "lose_fat");
  const equipment = asString(raw.equipment, "full_gym");
  const experience = asString(raw.experience, "beginner");
  const days = clamp(raw.training_days_per_week ?? raw.daysPerWeek, 2, 6, 4);
  const hasInjuries = asStringArray(raw.injuries).length > 0;
  return normalizeProgramPreferences({
    daysPerWeek: days as ProgramPreferences["daysPerWeek"],
    goal:
      goal === "gain_muscle"
        ? "hypertrophy"
        : goal === "improve_heart"
          ? "athletic"
          : goal === "recomp"
            ? "hypertrophy"
            : "fat_loss",
    equipment:
      equipment === "bodyweight" || equipment === "none"
        ? "bodyweight"
        : equipment === "dumbbells" || equipment === "home-basic"
          ? "dumbbells"
          : "full_gym",
    experience:
      experience === "intermediate" || experience === "advanced"
        ? experience
        : "beginner",
    timePerWorkout: 45,
    focus:
      days >= 6 &&
      experience !== "beginner" &&
      (equipment === "full_gym" || equipment === "gym") &&
      !hasInjuries
        ? "push_pull_legs"
        : days <= 3
          ? "full_body"
          : "upper_lower",
  });
}

export async function completeCoachOnboarding(raw: RawCoachOnboarding) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in required");

  const weightKg = asNumber(raw.weight_kg ?? raw.weightKg ?? raw.current_weight_kg);
  const heightCm = asNumber(raw.height_cm ?? raw.heightCm);
  const trainingDays = clamp(raw.training_days_per_week ?? raw.daysPerWeek, 2, 6, 4);
  const injuries = asStringArray(raw.injuries ?? raw.medical_flags);
  const goal = asString(raw.goal, "lose_fat");
  const activityLevel = asString(raw.activity_level, "light");
  const sex = asString(raw.sex, "unspecified");
  const age = asNumber(raw.age);
  const targetWeightKg = asNumber(raw.target_weight_kg ?? raw.goal_weight_kg);
  const programPreferences = toProgramPreferences({
    ...raw,
    training_days_per_week: trainingDays,
    injuries,
  });
  const nutritionGoals = deriveNutritionGoals({
    weightKg,
    goal: nutritionGoalFromRaw(goal),
    goalWeightKg: targetWeightKg,
    activityLevel: activityLevel as any,
    sex: sex as any,
    age,
    heightCm,
  });

  const profile = {
    goal,
    timeframe_weeks: clamp(raw.timeframe_weeks, 4, 52, 12),
    transformation_intensity: asString(
      raw.transformation_intensity ?? raw.style,
      "ease_in"
    ),
    style: asString(raw.style ?? raw.transformation_intensity, "ease_in"),
    weight_kg: weightKg,
    weightKg,
    height_cm: heightCm,
    heightCm,
    activity_level: activityLevel,
    training_days_per_week: trainingDays,
    experience: asString(raw.experience, "beginner"),
    equipment: asString(raw.equipment, "full_gym"),
    injuries,
    diet_preference: asString(raw.diet_preference ?? raw.diet, "balanced"),
    target_weight_kg: targetWeightKg,
    target_body_fat_percent: asNumber(raw.target_body_fat_percent),
    visual_goal: asString(raw.visual_goal),
    sex,
    age,
    medical_flags:
      raw.medical_flags && typeof raw.medical_flags === "object"
        ? raw.medical_flags
        : {},
    programPreferences,
    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const safeProfile = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined)
  );

  const workoutPlan = await generateWorkoutPlan({
    focus: "full",
    equipment:
      programPreferences.equipment === "bodyweight"
        ? "none"
        : programPreferences.equipment === "dumbbells"
          ? "dumbbells"
          : "gym",
    daysPerWeek: trainingDays,
    injuries,
  });

  const heightFtIn = heightCm ? inToFtIn(cmToIn(heightCm)) : null;
  const plan = {
    days: trainingDays,
    split:
      programPreferences.focus === "push_pull_legs"
        ? "Push / Pull / Legs"
        : programPreferences.focus === "upper_lower"
          ? "Upper / Lower"
          : "Full Body",
    workoutPlanId:
      typeof (workoutPlan as any)?.planId === "string"
        ? (workoutPlan as any).planId
        : null,
    workoutSource: (workoutPlan as any)?.source ?? "generated",
    target_kcal: nutritionGoals.calories,
    calorieTarget: nutritionGoals.calories,
    protein_g: nutritionGoals.proteinGrams,
    proteinFloor: nutritionGoals.proteinGrams,
    carbs_g: nutritionGoals.carbsGrams,
    fat_g: nutritionGoals.fatGrams,
    tdee: nutritionGoals.tdee,
    bmr: nutritionGoals.bmr,
    weight_lb: weightKg ? kgToLb(weightKg) : undefined,
    height_ft: heightFtIn?.ft,
    height_in: heightFtIn?.inches,
    disclaimer: "Fitness and nutrition guidance only — not medical advice.",
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, "users", user.uid, "coach", "profile"), safeProfile, {
      merge: true,
    }),
    setDoc(doc(db, "users", user.uid, "coachPlans", "current"), plan, {
      merge: true,
    }),
    setDoc(
      doc(db, "users", user.uid),
      {
        onboardingCompleted: true,
        onboarding: {
          completed: true,
          completedAt: serverTimestamp(),
          version: 2,
        },
      },
      { merge: true }
    ),
  ]);

  return { profile: safeProfile, plan, workoutPlan };
}
