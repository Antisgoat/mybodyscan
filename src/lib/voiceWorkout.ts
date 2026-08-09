export type VoiceWorkoutUnit = "lb" | "kg";

export type VoiceWorkoutEntry = {
  exercise: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  unit: VoiceWorkoutUnit | null;
  confidence: "high" | "medium" | "low";
  transcript: string;
};

const UNIT_ALIASES: Record<string, VoiceWorkoutUnit> = {
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
};

function cleanExercise(value: string): string {
  return value
    .replace(/\b(?:at|with|for|x)\b\s*$/i, "")
    .replace(/[,:;-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function finitePositive(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseUnit(value: string | undefined): VoiceWorkoutUnit | null {
  if (!value) return null;
  return UNIT_ALIASES[value.toLowerCase()] ?? null;
}

/**
 * Parses common gym phrases without calling a model, so voice logging remains
 * fast, predictable, and cheap. Speech-to-text can feed this function on any
 * supported platform.
 *
 * Examples:
 * - "bench press 225 for 8"
 * - "bench press 225 pounds for 8 reps"
 * - "squat 3 sets of 5 at 315 pounds"
 * - "deadlift 180 kg x 5"
 */
export function parseVoiceWorkoutEntry(
  transcript: string,
  defaultUnit?: VoiceWorkoutUnit
): VoiceWorkoutEntry | null {
  const raw = transcript.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const setFirst = raw.match(
    /^(.+?)\s+(\d+)\s+sets?\s+(?:of\s+)?(\d+)\s+(?:reps?\s+)?(?:at|with)\s+(\d+(?:\.\d+)?)\s*(lb|lbs|pounds?|kg|kgs|kilograms?)?$/i
  );
  if (setFirst) {
    const exercise = cleanExercise(setFirst[1]);
    if (!exercise) return null;
    return {
      exercise,
      sets: finitePositive(setFirst[2]),
      reps: finitePositive(setFirst[3]),
      weight: finitePositive(setFirst[4]),
      unit: parseUnit(setFirst[5]) ?? defaultUnit ?? null,
      confidence: "high",
      transcript: raw,
    };
  }

  const weightThenReps = raw.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s*(lb|lbs|pounds?|kg|kgs|kilograms?)?\s+(?:for|x)\s+(\d+)\s*(?:reps?)?$/i
  );
  if (weightThenReps) {
    const exercise = cleanExercise(weightThenReps[1]);
    if (!exercise) return null;
    return {
      exercise,
      sets: null,
      reps: finitePositive(weightThenReps[4]),
      weight: finitePositive(weightThenReps[2]),
      unit: parseUnit(weightThenReps[3]) ?? defaultUnit ?? null,
      confidence: "high",
      transcript: raw,
    };
  }

  const repsAtWeight = raw.match(
    /^(.+?)\s+(\d+)\s+reps?\s+(?:at|with)\s+(\d+(?:\.\d+)?)\s*(lb|lbs|pounds?|kg|kgs|kilograms?)?$/i
  );
  if (repsAtWeight) {
    const exercise = cleanExercise(repsAtWeight[1]);
    if (!exercise) return null;
    return {
      exercise,
      sets: null,
      reps: finitePositive(repsAtWeight[2]),
      weight: finitePositive(repsAtWeight[3]),
      unit: parseUnit(repsAtWeight[4]) ?? defaultUnit ?? null,
      confidence: "high",
      transcript: raw,
    };
  }

  const repsOnly = raw.match(/^(.+?)\s+(?:for\s+)?(\d+)\s+reps?$/i);
  if (repsOnly) {
    const exercise = cleanExercise(repsOnly[1]);
    if (!exercise) return null;
    return {
      exercise,
      sets: null,
      reps: finitePositive(repsOnly[2]),
      weight: null,
      unit: defaultUnit ?? null,
      confidence: "medium",
      transcript: raw,
    };
  }

  return null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Finds the best existing workout exercise rather than creating duplicates. */
export function matchVoiceExercise<T extends { id: string; name?: string }>(
  entry: VoiceWorkoutEntry,
  exercises: T[]
): T | null {
  const wanted = normalizeName(entry.exercise);
  if (!wanted) return null;

  const exact = exercises.find((item) => normalizeName(item.name ?? "") === wanted);
  if (exact) return exact;

  const contained = exercises.filter((item) => {
    const candidate = normalizeName(item.name ?? "");
    return candidate && (candidate.includes(wanted) || wanted.includes(candidate));
  });
  return contained.length === 1 ? contained[0] : null;
}
