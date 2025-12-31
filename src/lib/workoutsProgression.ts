import { getExerciseByExactName } from "@/lib/exercises/library";

export type RepRange = { min: number; max: number } | null;

export function parseRepRange(value: unknown): RepRange {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  // Handle time-based prescriptions: "30-45s", "45s", "30-60s"
  if (raw.includes("s")) return null;

  // Normalize dash variants.
  const normalized = raw.replace(/[–—]/g, "-").replace(/\s+/g, "");
  const m = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (min <= 0 || max <= 0) return null;
  return { min, max };
}

export function isAtTopOfRange(params: {
  targetReps: unknown;
  repsDone: unknown;
}): boolean {
  const range = parseRepRange(params.targetReps);
  if (!range) return false;
  const done =
    typeof params.repsDone === "string" ? params.repsDone.trim() : "";
  if (!done) return false;
  const n = Number(done);
  if (!Number.isFinite(n)) return false;
  return n >= range.max;
}

export function progressionTip(params: {
  exerciseName: string;
  targetReps: unknown;
  repsDone?: string | null;
  rpe?: number | null;
}): string {
  const ex = getExerciseByExactName(params.exerciseName);
  const tags = new Set((ex?.tags ?? []).map((t) => t.toLowerCase()));
  const isPrimaryCompound = Boolean(tags.has("primary_compound"));
  const isAccessory = Boolean(tags.has("accessory")) && !isPrimaryCompound;

  const range = parseRepRange(params.targetReps);
  const rangeText = range ? `${range.min}-${range.max}` : typeof params.targetReps === "string" ? params.targetReps : "a controlled rep range";

  // Default autoregulation guidance
  const rpeText =
    typeof params.rpe === "number" && Number.isFinite(params.rpe)
      ? ` (RPE ${params.rpe})`
      : "";

  const hitTop = isAtTopOfRange({
    targetReps: params.targetReps,
    repsDone: params.repsDone ?? "",
  });

  if (hitTop) {
    const inc =
      isPrimaryCompound
        ? "add 2.5–5 lb next time"
        : isAccessory
          ? "add a small amount next time"
          : "add 2.5 lb next time";
    return `Progression: stay in ${rangeText} reps${rpeText}. If you can hit the top of the range with solid form, ${inc}.`;
  }

  return `Progression: stay in ${rangeText} reps${rpeText}. Add reps week to week until you reach the top of the range, then increase load slightly and repeat.`;
}

