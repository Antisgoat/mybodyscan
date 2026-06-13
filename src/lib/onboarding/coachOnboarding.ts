import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/auth/mbs-auth";
import { setDoc } from "@/lib/dbWrite";
import { generateWorkoutPlan } from "@/lib/workouts";
import {
  normalizeProgramPreferences,
  type ProgramPreferences,
} from "@/lib/programs/preferences";

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

function toProgramPreferences(raw: RawCoachOnboarding): ProgramPreferences {
  const goal = asString(raw.goal, "lose_fat");
  const equipment = asString(raw.equipment, "full_gym");
  const experience = asString(raw.experience, "beginner");
  return normalizeProgramPreferences({
    daysPerWeek: clamp(raw.training_days_per_week ?? raw.daysPerWeek, 2, 6, 4) as ProgramPreferences["daysPerWeek"],
    goal:
      goal === "gain_muscle"
        ? "hypertrophy"
        : goal === "improve_heart"
          ? "athletic"
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
      clamp(raw.training_days_per_week ?? raw.daysPerWeek, 2, 6, 4) >= 6 &&
      experience !== "beginner" &&
      (equipment === "full_gym" || equipment === "gym") &&
      asStringArray(raw.injuries).length === 0
        ? "push_pull_legs"
        : clamp(raw.training_days_per_week ?? raw.daysPerWeek, 2, 6, 4) <= 3
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
  const programPreferences = toProgramPreferences({
    ...raw,
    training_days_per_week: trainingDays,
    injuries,
  });

  const profile = {
    goal: asString(raw.goal, "lose_fat"),
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
    activity_level: asString(raw.activity_level, "light"),
    training_days_per_week: trainingDays,
    experience: asString(raw.experience, "beginner"),
    equipment: asString(raw.equipment, "full_gym"),
    injuries,
    diet_preference: asString(raw.diet_preference ?? raw.diet, "balanced"),
    target_weight_kg: asNumber(raw.target_weight_kg ?? raw.goal_weight_kg),
    target_body_fat_percent: asNumber(raw.target_body_fat_percent),
    visual_goal: asString(raw.visual_goal),
    sex: asString(raw.sex, "unspecified"),
    age: asNumber(raw.age),
    medical_flags: raw.medical_flags && typeof raw.medical_flags === "object" ? raw.medical_flags : {},
    programPreferences,
    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const safeProfile = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined)
  );

  await setDoc(doc(db, "users", user.uid, "coach", "profile"), safeProfile, {
    merge: true,
  });

  const plan = await generateWorkoutPlan({
    focus: programPreferences.focus === "push_pull_legs" ? "full" : "full",
    equipment:
      programPreferences.equipment === "bodyweight"
        ? "none"
        : programPreferences.equipment === "dumbbells"
          ? "dumbbells"
          : "gym",
    daysPerWeek: trainingDays,
    injuries,
  });

  return { profile, plan };
}
