import { getExerciseByExactName } from "@/lib/exercises/library";

export type RepRange = { min: number; max: number } | null;
export type ParsedLoad = { value: number; unit: "lb" | "kg" } | null;

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

export function parseLoad(value: unknown): ParsedLoad {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const unit: "lb" | "kg" = raw.includes("kg") ? "kg" : "lb";
  const num = Number.parseFloat(raw.replace(/[^0-9.]+/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  return { value: num, unit };
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

export function formatLogSummary(params: {
  load?: string | null;
  repsDone?: string | null;
  rpe?: number | null;
}): string {
  const parts: string[] = [];
  const load = typeof params.load === "string" ? params.load.trim() : "";
  const reps = typeof params.repsDone === "string" ? params.repsDone.trim() : "";
  if (load) parts.push(load);
  if (reps) parts.push(`${reps} reps`);
  if (typeof params.rpe === "number" && Number.isFinite(params.rpe)) {
    parts.push(`RPE ${params.rpe}`);
  }
  return parts.join(" · ");
}

export function isPR(params: {
  previous?: { load?: string | null; repsDone?: string | null } | null;
  current?: { load?: string | null; repsDone?: string | null } | null;
}): boolean {
  const prev = params.previous ?? null;
  const cur = params.current ?? null;
  if (!cur) return false;

  const prevLoad = parseLoad(prev?.load ?? null);
  const curLoad = parseLoad(cur?.load ?? null);

  const prevReps = Number(prev?.repsDone ?? NaN);
  const curReps = Number(cur?.repsDone ?? NaN);

  // Prefer weight-based PR if both loads exist in the same unit.
  if (prevLoad && curLoad && prevLoad.unit === curLoad.unit) {
    if (curLoad.value > prevLoad.value) return true;
    if (curLoad.value < prevLoad.value) return false;
    if (Number.isFinite(prevReps) && Number.isFinite(curReps) && curReps > prevReps) {
      return true;
    }
    return false;
  }

  // Otherwise fall back to reps-based PR if both are numeric.
  if (Number.isFinite(prevReps) && Number.isFinite(curReps)) {
    return curReps > prevReps;
  }
  return false;
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

