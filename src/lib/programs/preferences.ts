export type ProgramPreferenceGoal = "strength" | "hypertrophy" | "fat_loss" | "athletic";
export type ProgramPreferenceEquipment = "full_gym" | "dumbbells" | "bodyweight";
export type ProgramPreferenceExperience = "beginner" | "intermediate" | "advanced";
export type ProgramPreferenceFocus =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "conditioning"
  | "mobility";

export type ProgramPreferences = {
  daysPerWeek: 3 | 4 | 5 | 6;
  goal: ProgramPreferenceGoal;
  equipment: ProgramPreferenceEquipment;
  experience: ProgramPreferenceExperience;
  timePerWorkout: 30 | 45 | 60 | 75;
  focus: ProgramPreferenceFocus;
};

export const DEFAULT_PROGRAM_PREFERENCES: ProgramPreferences = {
  daysPerWeek: 4,
  goal: "hypertrophy",
  equipment: "full_gym",
  experience: "beginner",
  timePerWorkout: 45,
  focus: "full_body",
};

export function normalizeProgramPreferences(
  raw?: Partial<ProgramPreferences> | null
): ProgramPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PROGRAM_PREFERENCES;
  const days = [3, 4, 5, 6].includes(Number(raw.daysPerWeek))
    ? (Number(raw.daysPerWeek) as ProgramPreferences["daysPerWeek"])
    : DEFAULT_PROGRAM_PREFERENCES.daysPerWeek;
  const goal =
    raw.goal === "strength" ||
    raw.goal === "hypertrophy" ||
    raw.goal === "fat_loss" ||
    raw.goal === "athletic"
      ? raw.goal
      : DEFAULT_PROGRAM_PREFERENCES.goal;
  const equipment =
    raw.equipment === "full_gym" ||
    raw.equipment === "dumbbells" ||
    raw.equipment === "bodyweight"
      ? raw.equipment
      : DEFAULT_PROGRAM_PREFERENCES.equipment;
  const experience =
    raw.experience === "beginner" ||
    raw.experience === "intermediate" ||
    raw.experience === "advanced"
      ? raw.experience
      : DEFAULT_PROGRAM_PREFERENCES.experience;
  const time = [30, 45, 60, 75].includes(Number(raw.timePerWorkout))
    ? (Number(raw.timePerWorkout) as ProgramPreferences["timePerWorkout"])
    : DEFAULT_PROGRAM_PREFERENCES.timePerWorkout;
  const focus =
    raw.focus === "full_body" ||
    raw.focus === "upper_lower" ||
    raw.focus === "push_pull_legs" ||
    raw.focus === "conditioning" ||
    raw.focus === "mobility"
      ? raw.focus
      : DEFAULT_PROGRAM_PREFERENCES.focus;

  return {
    daysPerWeek: days,
    goal,
    equipment,
    experience,
    timePerWorkout: time,
    focus,
  };
}
