import type { Day, Exercise } from "./types";

interface FlattenedSet {
  exIdx: number;
  set: number;
  name: string;
  planName: string;
  targetReps: string;
  restSec?: number;
}

type DisplayOverrides = Record<number, string | undefined>;

export function flattenDay(day: Day, overrides?: DisplayOverrides): FlattenedSet[] {
  const rows: FlattenedSet[] = [];
  let globalExerciseIndex = 0;
  day.blocks.forEach((block) => {
    block.exercises.forEach((exercise) => {
      for (let i = 1; i <= exercise.sets; i += 1) {
        rows.push({
          exIdx: globalExerciseIndex,
          set: i,
          name: overrides?.[globalExerciseIndex] ?? exercise.name,
          planName: exercise.name,
          targetReps: exercise.reps,
          restSec: exercise.restSec,
        });
      }
      globalExerciseIndex += 1;
    });
  });
  return rows;
}

export function nextProgressionHint(exercise: Exercise): string {
  const { reps, rir, restSec, tempo } = exercise;
  const rirText = typeof rir === "number" ? ` Aim to finish around ${rir} RIR.` : "";
  const restText = typeof restSec === "number" ? ` Keep rest about ${Math.round(restSec / 30) * 30} sec.` : "";
  const tempoText = tempo ? ` Control tempo (${tempo}).` : "";
  return `Add 2.5–5 lb next week if all sets hit ${reps}.${rirText}${restText}${tempoText}`.trim();
}

function parseRepRange(reps: string): { lower: number | null; upper: number | null } | null {
  const cleaned = reps.trim().toLowerCase();
  if (!cleaned || cleaned.includes("amrap") || cleaned.includes("min")) {
    return null;
  }

  const rangeMatch = cleaned.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return {
      lower: Number.parseInt(rangeMatch[1], 10),
      upper: Number.parseInt(rangeMatch[2], 10),
    };
  }

  const singleMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const value = Number.parseFloat(singleMatch[1]);
    return { lower: value, upper: value };
  }

  return null;
}

function isCompoundLift(name: string): boolean {
  const normalized = name.toLowerCase();
  const keywords = [
    "squat",
    "deadlift",
    "press",
    "bench",
    "row",
    "pull-up",
    "chin-up",
    "lunge",
    "clean",
    "snatch",
    "thruster",
    "hip thrust",
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function computeNextTargets(params: {
  exerciseName: string;
  lastSets: { reps: number; weight?: number }[];
  planTarget: { sets: number; reps: string; rir?: number };
}): { suggestion: string } {
  const { exerciseName, lastSets, planTarget } = params;
  if (!lastSets.length) {
    return { suggestion: "maintain" };
  }

  const repRange = parseRepRange(planTarget.reps);
  if (!repRange) {
    return { suggestion: "maintain" };
  }

  const { lower, upper } = repRange;
  const avgReps = lastSets.reduce((sum, set) => sum + set.reps, 0) / lastSets.length;
  const allMetUpper = typeof upper === "number" && lastSets.every((set) => set.reps >= upper);

  if (allMetUpper) {
    if (isCompoundLift(exerciseName)) {
      return { suggestion: "+5 lb if all sets completed" };
    }
    return { suggestion: "+1 rep if all sets completed" };
  }

  const baseline = lower ?? upper;
  if (typeof baseline === "number" && avgReps <= baseline - 2) {
    return { suggestion: "hold or drop 5%" };
  }

  return { suggestion: "maintain" };
}
