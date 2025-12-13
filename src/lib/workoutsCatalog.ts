import type { Program } from "@/lib/coach/types";
import type { ProgramMeta } from "@/lib/coach/catalog";
import type { CatalogPlanSubmission } from "@/lib/workouts";

const DAY_NAME_PRESETS: Record<number, string[]> = {
  1: ["Mon"],
  2: ["Mon", "Thu"],
  3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Fri"],
  5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function pickWeekdays(count: number): string[] {
  const clamped = Math.max(1, Math.min(Number.isFinite(count) ? count : 3, 7));
  return DAY_NAME_PRESETS[clamped] ?? DAY_NAME_PRESETS[3];
}

function flattenExercises(
  day: Program["weeks"][number]["days"][number] | null | undefined
): CatalogPlanSubmission["days"][number]["exercises"] {
  const exercises =
    day?.blocks?.flatMap((block) => block?.exercises || [])?.filter(Boolean) ??
    [];
  if (!exercises.length) {
    return [{ name: "Session", sets: 3, reps: "10" }];
  }
  return exercises.slice(0, 12).map((exercise, index) => ({
    name: exercise?.name || `Exercise ${index + 1}`,
    sets:
      Number.isFinite(exercise?.sets) && Number(exercise.sets) > 0
        ? Number(exercise.sets)
        : 3,
    reps: exercise?.reps ?? "10",
  }));
}

/**
 * Build a minimal catalog plan payload for `/applyCatalogPlan`.
 *
 * Guardrails:
 * - Never throws (used in user click-paths).
 * - If the source program has missing schedule data, returns a safe placeholder.
 */
export function buildCatalogPlanSubmission(
  program: Program | null | undefined,
  meta: ProgramMeta | null | undefined
): CatalogPlanSubmission {
  const programId = program?.id || meta?.id || "unknown-program";
  const title = program?.title || meta?.title || "Workout program";
  const goal = program?.goal || meta?.goal || undefined;
  const level = meta?.level || program?.level || undefined;

  const baseWeek = program?.weeks?.[0];
  const sourceDays = baseWeek?.days ?? [];

  const daysPerWeek =
    typeof meta?.daysPerWeek === "number" && meta.daysPerWeek > 0
      ? meta.daysPerWeek
      : sourceDays.length || 3;
  const weekdays = pickWeekdays(daysPerWeek);

  const days =
    sourceDays.length > 0
      ? weekdays.map((dayName, index) => ({
          day: dayName,
          exercises: flattenExercises(sourceDays[index]),
        }))
      : weekdays.map((dayName) => ({
          day: dayName,
          exercises: [{ name: "Session", sets: 3, reps: "10" }],
        }));

  return {
    programId,
    title,
    goal: goal as any,
    level: level as any,
    days,
  };
}

