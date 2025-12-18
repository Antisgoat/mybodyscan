import type { CatalogPlanDay } from "@/lib/workouts";

const VALID_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

export function validateWorkoutPlanDays(days: CatalogPlanDay[]): string | null {
  if (!Array.isArray(days) || !days.length) return "At least one workout day is required.";
  const dayNames = days.map((d) => d?.day).filter(Boolean) as string[];
  if (dayNames.some((d) => !VALID_DAYS.has(d))) {
    return "Workout days must be Mon–Sun.";
  }
  const unique = new Set(dayNames);
  if (unique.size !== dayNames.length) {
    return "Each workout day must be unique (Mon–Sun).";
  }
  if (
    days.some(
      (d) => !Array.isArray(d?.exercises) || (d.exercises as any[]).length === 0
    )
  ) {
    return "Each workout day needs at least one exercise.";
  }
  return null;
}

