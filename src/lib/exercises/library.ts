import type { Exercise, Equipment, MovementPattern } from "@/data/exercises";
import { EXERCISES, SUBSTITUTIONS } from "@/data/exercises";

export type EquipmentMode = "full_gym" | "minimal";

export function normalizeExerciseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function allExercises(): Exercise[] {
  return EXERCISES;
}

export function getExerciseById(id: string): Exercise | null {
  const found = EXERCISES.find((ex) => ex.id === id);
  return found ?? null;
}

export function getExerciseByExactName(name: string): Exercise | null {
  const target = normalizeExerciseName(name);
  if (!target) return null;
  const found = EXERCISES.find((ex) => normalizeExerciseName(ex.name) === target);
  return found ?? null;
}

export function filterByEquipment(
  exercises: Exercise[],
  allowed: Set<Equipment>
): Exercise[] {
  if (!allowed.size) return exercises;
  return exercises.filter((ex) => ex.equipment.some((eq) => allowed.has(eq)));
}

export function filterByMode(exercises: Exercise[], mode: EquipmentMode): Exercise[] {
  if (mode === "minimal") {
    const allowed = new Set<Equipment>(["dumbbell", "bodyweight"]);
    return filterByEquipment(exercises, allowed);
  }
  // full gym: prefer exercises tagged full_gym, but don't hard-exclude home-safe moves.
  return exercises;
}

export function searchExercises(params: {
  query?: string;
  movementPattern?: MovementPattern | null;
  includeTags?: string[];
  excludeIds?: Set<string>;
  equipment?: Set<Equipment>;
  mode?: EquipmentMode;
  limit?: number;
}): Exercise[] {
  const q = normalizeExerciseName(params.query ?? "");
  const tokens = q ? q.split(" ").filter(Boolean) : [];

  let list = EXERCISES.slice();

  if (params.mode) {
    list = filterByMode(list, params.mode);
  }
  if (params.equipment?.size) {
    list = filterByEquipment(list, params.equipment);
  }
  if (params.movementPattern) {
    list = list.filter((ex) => ex.movementPattern === params.movementPattern);
  }
  if (params.includeTags?.length) {
    const tags = params.includeTags.map((t) => t.toLowerCase());
    list = list.filter((ex) => tags.every((t) => ex.tags.some((x) => x.toLowerCase() === t)));
  }
  if (params.excludeIds?.size) {
    list = list.filter((ex) => !params.excludeIds!.has(ex.id));
  }

  const scored = list
    .map((ex) => {
      if (!tokens.length) return { ex, score: 0 };
      const hay = `${ex.name} ${ex.primaryMuscles.join(" ")} ${ex.secondaryMuscles.join(" ")} ${ex.tags.join(" ")}`;
      const nh = normalizeExerciseName(hay);
      let score = 0;
      for (const t of tokens) {
        if (normalizeExerciseName(ex.name).includes(t)) score += 8;
        if (nh.includes(t)) score += 2;
      }
      // Small preference for full-gym staples so results feel "real gym".
      if (ex.tags.includes("primary_compound")) score += 1;
      if (ex.tags.includes("full_gym")) score += 1;
      return { ex, score };
    })
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
    .map((s) => s.ex);

  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  return scored.slice(0, limit);
}

export function getSubstitutionPool(params: {
  movementPattern: MovementPattern;
  equipment: Set<Equipment>;
}): Exercise[] {
  const map = SUBSTITUTIONS[params.movementPattern] ?? {};
  const out: Exercise[] = [];
  const seen = new Set<string>();
  for (const eq of params.equipment) {
    const ids = map[eq] ?? [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const ex = getExerciseById(id);
      if (!ex) continue;
      seen.add(id);
      out.push(ex);
    }
  }
  return out;
}

