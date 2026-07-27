import {
  EXERCISES,
  type Exercise,
  type MovementPattern,
} from "@/data/exercises";
import { lbToKg, kgToLb, type DisplayUnits } from "@/lib/units";
import { parseLoad } from "@/lib/workoutsProgression";

const PATTERN_KEYWORDS: Array<[MovementPattern, RegExp]> = [
  ["vertical_pull", /\b(pull[\s-]?up|pulldown|vertical pull)\b/i],
  ["horizontal_pull", /\b(row|horizontal pull|upper back)\b/i],
  ["vertical_push", /\b(overhead|shoulder press|vertical push|landmine)\b/i],
  ["horizontal_push", /\b(bench|chest|push[\s-]?up|horizontal push)\b/i],
  ["hinge", /\b(deadlift|rdl|romanian|hip thrust|glute bridge|hinge)\b/i],
  ["squat", /\b(squat|leg press|lunge|step[\s-]?up|single-leg)\b/i],
  ["carry", /\b(carry|farmer|suitcase)\b/i],
  ["core", /\b(core|plank|dead bug|crunch|rotation)\b/i],
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function inferMovementPattern(name: string): MovementPattern | null {
  const exact = EXERCISES.find(
    (exercise) => normalizeName(exercise.name) === normalizeName(name)
  );
  if (exact) return exact.movementPattern;
  return (
    PATTERN_KEYWORDS.find(([, pattern]) => pattern.test(name))?.[0] ?? null
  );
}

export function suggestExerciseSwaps(name: string, limit = 5): Exercise[] {
  const pattern = inferMovementPattern(name);
  if (!pattern) return [];
  const normalized = normalizeName(name);
  return EXERCISES.filter(
    (exercise) =>
      exercise.movementPattern === pattern &&
      normalizeName(exercise.name) !== normalized
  )
    .sort((left, right) => {
      const leftFriendly = left.tags.some((tag) => tag.endsWith("_friendly"));
      const rightFriendly = right.tags.some((tag) => tag.endsWith("_friendly"));
      if (leftFriendly !== rightFriendly) return leftFriendly ? -1 : 1;
      if (left.difficulty !== right.difficulty) {
        const order = { beginner: 0, intermediate: 1, advanced: 2 };
        return order[left.difficulty] - order[right.difficulty];
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(1, limit));
}

export function formatSessionTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function firstNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function calculateWorkoutVolume(
  exercises: Array<{ id: string; sets?: number | string }>,
  logs: Record<
    string,
    { load?: string | null; repsDone?: string | null } | undefined
  >,
  units: DisplayUnits
): { value: number; unit: "lb" | "kg"; includedExercises: number } {
  let totalKg = 0;
  let includedExercises = 0;
  for (const exercise of exercises) {
    const log = logs[exercise.id];
    const load = parseLoad(log?.load);
    const sets = firstNumber(exercise.sets);
    const reps = firstNumber(log?.repsDone);
    if (!load || !sets || !reps) continue;
    const loadKg = load.unit === "kg" ? load.value : lbToKg(load.value);
    totalKg += loadKg * sets * reps;
    includedExercises += 1;
  }
  const value = units === "metric" ? totalKg : kgToLb(totalKg);
  return {
    value: Math.round(value),
    unit: units === "metric" ? "kg" : "lb",
    includedExercises,
  };
}
