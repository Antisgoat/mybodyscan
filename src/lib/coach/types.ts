import type { WeightUnit } from "@/lib/units";

export type CoachSex = "male" | "female" | "unspecified" | "other";

export interface CoachProfile {
  sex?: CoachSex;
  age?: number;
  dob?: string;
  height_cm?: number;
  heightCm?: number;
  weight_kg?: number;
  /** Canonical storage (kg). Kept alongside `weight_kg` for backwards compatibility. */
  weightKg?: number;
  /** Preferred display unit for weight. */
  unit?: WeightUnit;
  activity_level?: "sedentary" | "light" | "moderate" | "very" | "extra";
  goal?: "lose_fat" | "gain_muscle" | "improve_heart";
  timeframe_weeks?: number;
  style?: "ease_in" | "all_in";
  medical_flags?: Record<string, boolean>;
  currentProgramId?: string;
  activeProgramId?: string;
  lastCompletedWeekIdx?: number;
  lastCompletedDayIdx?: number;
  currentWeekIdx?: number;
  currentDayIdx?: number;
  startedAt?: string;
  programPreferences?: unknown;
}

export interface CoachPlanBlock {
  title: string;
  focus: string;
  work: string[];
}

export interface CoachPlanSession {
  day: string;
  blocks: CoachPlanBlock[];
}

export interface CoachPlan {
  days: number;
  split: string;
  sessions: CoachPlanSession[];
  progression: { deloadEvery: number };
  calorieTarget: number;
  proteinFloor: number;
  disclaimer?: string;
  /**
   * Normalized for UI: when absent or malformed in Firestore, this is null.
   * (Never undefined to keep render paths stable.)
   */
  updatedAt: Date | null;
}

export type ProgramGoal = "hypertrophy" | "strength" | "cut" | "general";

export type ProgramLevel = "beginner" | "intermediate" | "advanced";

export type ProgramEquipment =
  | "none"
  | "dumbbells"
  | "kettlebells"
  | "barbell"
  | "machines"
  | "bands";

export interface ProgramFaq {
  q: string;
  a: string;
}

export interface Program {
  id: string;
  title: string;
  goal: ProgramGoal;
  weeks: Week[];
  summary?: string;
  description?: string;
  level?: ProgramLevel;
  equipment?: ProgramEquipment[];
  durationPerSessionMin?: number;
  tags?: string[];
  heroImg?: string;
  faqs?: ProgramFaq[];
  rationale?: string;
  /**
   * 1-based week numbers that should automatically run as deloads.
   */
  deloadWeeks?: number[];
}

export interface Week {
  days: Day[];
}

export interface Day {
  name: string;
  blocks: Block[];
}

export interface Block {
  title: string;
  exercises: Exercise[];
}

export interface ExerciseSubstitution {
  name: string;
  reason?: string;
  equipment?: string[];
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  rir?: number;
  tempo?: string;
  substitutions?: ExerciseSubstitution[];
}
