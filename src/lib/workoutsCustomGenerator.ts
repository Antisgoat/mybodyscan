import type { CatalogPlanDay, CatalogPlanExercise, CustomPlanPrefs } from "@/lib/workouts";
import type { Difficulty, Equipment, Exercise, MovementPattern } from "@/data/exercises";
import { allExercises, getExerciseByExactName, getSubstitutionPool, normalizeExerciseName, searchExercises } from "@/lib/exercises/library";

type Experience = NonNullable<CustomPlanPrefs["experience"]>;
type Goal = NonNullable<CustomPlanPrefs["goal"]>;
type Focus = NonNullable<CustomPlanPrefs["focus"]>;

type MuscleGroup = "chest" | "back" | "legs" | "shoulders" | "arms" | "calves" | "core";
type MuscleTargets = Record<MuscleGroup, { min: number; max: number }>;
type MuscleVolume = Record<MuscleGroup, number>;

type Slot = {
  key: string;
  label: string;
  movementPattern?: MovementPattern;
  includeTags?: string[];
  isPrimaryCompound?: boolean;
  optional?: boolean;
};

type DayTemplate = {
  name: string;
  slots: Slot[];
};

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const r = Math.round(v);
  return Math.max(min, Math.min(max, r));
}

function hash32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hash32(seed));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function pickWeekdays(count: number): Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"> {
  const presets: Record<number, any> = {
    2: ["Mon", "Thu"],
    3: ["Mon", "Wed", "Fri"],
    4: ["Mon", "Tue", "Thu", "Fri"],
    5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  };
  const clamped = Math.max(2, Math.min(count, 6));
  return (presets[clamped] ?? presets[4]) as any;
}

function allowedEquipFromPrefs(prefs: CustomPlanPrefs): { mode: "full_gym" | "minimal"; allowed: Set<Equipment> } {
  const eq = new Set((prefs.equipment ?? []).map((s) => String(s).toLowerCase()));
  const minimal =
    prefs.trainingStyle === "minimal_equipment" ||
    (!eq.has("gym") && (eq.has("dumbbells") || eq.has("bodyweight")));

  if (minimal) {
    return { mode: "minimal", allowed: new Set<Equipment>(["dumbbell", "bodyweight"]) };
  }

  // Default full gym (even if user didn't tick "gym", we prefer broad access as requested).
  return {
    mode: "full_gym",
    allowed: new Set<Equipment>(["barbell", "dumbbell", "machine", "cables", "smith", "bodyweight", "kettlebell"]),
  };
}

function maxMovesForTime(time: CustomPlanPrefs["timePerWorkout"]): number {
  if (time === "30") return 4;
  if (time === "60") return 6;
  if (time === "75+") return 7;
  return 5; // default 45
}

function difficultyOrder(d: Difficulty): number {
  return d === "beginner" ? 0 : d === "intermediate" ? 1 : 2;
}

function experienceOrder(e: Experience): number {
  return e === "beginner" ? 0 : e === "intermediate" ? 1 : 2;
}

function emptyVolume(): MuscleVolume {
  return {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
    calves: 0,
    core: 0,
  };
}

function volumeTargets(params: {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  focus: Focus;
}): MuscleTargets {
  // Science-based-ish defaults:
  // - Hypertrophy: ~10–20 hard sets/muscle/week (lower for beginners, cut phases).
  // - Strength/performance: moderate volume, heavier compounds (sets may be fewer).
  // We keep conservative ranges so small library constraints don't break generation.
  const days = clampInt(params.daysPerWeek, 2, 6, 4);
  const exp = params.experience;
  const goal = params.goal;

  const base =
    goal === "build_muscle" || goal === "recomp"
      ? exp === "beginner"
        ? { min: 6, max: 12 }
        : exp === "intermediate"
          ? { min: 8, max: 16 }
          : { min: 10, max: 20 }
      : goal === "lose_fat"
        ? exp === "beginner"
          ? { min: 4, max: 10 }
          : { min: 6, max: 12 }
        : // performance
          exp === "beginner"
          ? { min: 5, max: 10 }
          : { min: 6, max: 14 };

  // Adjust for fewer training days (harder to hit volume) vs more days (more capacity).
  const dayAdj = days <= 3 ? -1 : days >= 5 ? 1 : 0;
  const min = Math.max(3, base.min + dayAdj);
  const max = Math.max(min + 2, base.max + dayAdj);

  // Split-specific nudges: bro split tends to give higher single-day volume per muscle,
  // but lower frequency; keep upper bound a touch higher.
  const broBoost = params.focus === "bro_split" ? 2 : 0;

  return {
    chest: { min, max: max + broBoost },
    back: { min, max: max + broBoost },
    legs: { min, max: max + broBoost },
    shoulders: { min: Math.max(3, min - 1), max: Math.max(6, max - 1 + broBoost) },
    arms: { min: Math.max(3, min - 2), max: Math.max(6, max - 2 + broBoost) },
    calves: { min: goal === "performance" ? 3 : 2, max: goal === "build_muscle" ? 8 : 6 },
    core: { min: goal === "performance" ? 4 : 3, max: 10 },
  };
}

function tagsSet(ex: Exercise): Set<string> {
  return new Set((ex.tags ?? []).map((t) => t.toLowerCase()));
}

function exerciseMuscleContribution(ex: Exercise, sets: number): Partial<MuscleVolume> {
  const t = tagsSet(ex);
  const out: Partial<MuscleVolume> = {};

  // Legs
  if (t.has("quads") || t.has("hamstrings") || t.has("glutes") || ex.movementPattern === "squat" || ex.movementPattern === "hinge") {
    out.legs = (out.legs ?? 0) + sets;
  }
  if (t.has("calves")) out.calves = (out.calves ?? 0) + sets;

  // Push
  if (t.has("chest") || ex.movementPattern === "horizontal_push") out.chest = (out.chest ?? 0) + sets;
  if (t.has("lateral_delts") || t.has("rear_delts") || ex.movementPattern === "vertical_push") out.shoulders = (out.shoulders ?? 0) + sets;
  if (t.has("triceps")) out.arms = (out.arms ?? 0) + sets;

  // Pull
  if (t.has("lats") || t.has("back") || ex.movementPattern === "horizontal_pull" || ex.movementPattern === "vertical_pull") {
    out.back = (out.back ?? 0) + sets;
  }
  if (t.has("biceps")) out.arms = (out.arms ?? 0) + sets;

  // Core/carry
  if (ex.movementPattern === "core" || ex.movementPattern === "carry" || t.has("core")) {
    out.core = (out.core ?? 0) + sets;
  }

  return out;
}

function addVolume(total: MuscleVolume, delta: Partial<MuscleVolume>) {
  for (const k of Object.keys(delta) as MuscleGroup[]) {
    total[k] = (total[k] ?? 0) + (delta[k] ?? 0);
  }
}

function setsRepsForSlot(params: {
  goal: Goal;
  experience: Experience;
  isPrimaryCompound: boolean;
  movementPattern?: MovementPattern;
  includeTags?: string[];
}): { sets: number; reps: string } {
  const exp = params.experience;
  const goal = params.goal;
  const isCoreOrCarry = params.movementPattern === "core" || params.movementPattern === "carry";
  const isAccessory = !params.isPrimaryCompound && !isCoreOrCarry;

  const baseSets =
    exp === "beginner" ? (params.isPrimaryCompound ? 3 : 3) : exp === "intermediate" ? 4 : params.isPrimaryCompound ? 4 : 3;

  if (isCoreOrCarry) {
    if (goal === "performance") return { sets: 3, reps: params.movementPattern === "carry" ? "30-60s" : "8-12" };
    if (goal === "lose_fat") return { sets: 3, reps: params.movementPattern === "carry" ? "40-80s" : "10-15" };
    return { sets: 3, reps: params.movementPattern === "carry" ? "30-60s" : "8-12" };
  }

  if (goal === "performance") {
    return {
      sets: baseSets,
      reps: params.isPrimaryCompound ? "4-6" : isAccessory ? "10-15" : "6-10",
    };
  }
  if (goal === "lose_fat") {
    return {
      sets: Math.max(2, baseSets - 1),
      reps: params.isPrimaryCompound ? "6-10" : "10-15",
    };
  }
  if (goal === "build_muscle" || goal === "recomp") {
    return {
      sets: baseSets,
      reps: params.isPrimaryCompound ? "6-10" : "10-15",
    };
  }
  return { sets: baseSets, reps: "8-12" };
}

function buildTemplates(focus: Focus, daysPerWeek: number): DayTemplate[] {
  const days = clampInt(daysPerWeek, 2, 6, 4);

  const pushA: DayTemplate = {
    name: "Push A",
    slots: [
      { key: "push_h1", label: "Horizontal push", movementPattern: "horizontal_push", isPrimaryCompound: true },
      { key: "push_v1", label: "Vertical push", movementPattern: "vertical_push", isPrimaryCompound: true },
      { key: "push_delts", label: "Lateral delts", includeTags: ["lateral_delts"] },
      { key: "push_tri", label: "Triceps", includeTags: ["triceps"] },
      { key: "push_health", label: "Rear delts / shoulder health", includeTags: ["rear_delts"], optional: true },
    ],
  };
  const pushB: DayTemplate = {
    name: "Push B",
    slots: [
      { key: "push_v1", label: "Vertical push", movementPattern: "vertical_push", isPrimaryCompound: true },
      { key: "push_h1", label: "Horizontal push", movementPattern: "horizontal_push", isPrimaryCompound: true },
      { key: "push_chest", label: "Chest accessory", includeTags: ["chest"] },
      { key: "push_tri", label: "Triceps", includeTags: ["triceps"] },
      { key: "push_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };

  const pullA: DayTemplate = {
    name: "Pull A",
    slots: [
      { key: "pull_v1", label: "Vertical pull", movementPattern: "vertical_pull", isPrimaryCompound: true },
      { key: "pull_h1", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "pull_rear", label: "Rear delts", includeTags: ["rear_delts"] },
      { key: "pull_bi", label: "Biceps", includeTags: ["biceps"] },
      { key: "pull_carry", label: "Carry", movementPattern: "carry", optional: true },
    ],
  };
  const pullB: DayTemplate = {
    name: "Pull B",
    slots: [
      { key: "pull_h1", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "pull_v1", label: "Vertical pull", movementPattern: "vertical_pull", isPrimaryCompound: true },
      { key: "pull_lats", label: "Lats accessory", includeTags: ["lats"] },
      { key: "pull_bi", label: "Biceps", includeTags: ["biceps"] },
      { key: "pull_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };

  const legsA: DayTemplate = {
    name: "Legs A",
    slots: [
      { key: "legs_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "legs_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "legs_quads", label: "Quads", includeTags: ["quads"] },
      { key: "legs_hams", label: "Hamstrings", includeTags: ["hamstrings"] },
      { key: "legs_calves", label: "Calves", includeTags: ["calves"], optional: true },
    ],
  };
  const legsB: DayTemplate = {
    name: "Legs B",
    slots: [
      { key: "legs_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "legs_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "legs_glutes", label: "Glutes", includeTags: ["glutes"], optional: false },
      { key: "legs_calves", label: "Calves", includeTags: ["calves"], optional: true },
      { key: "legs_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };

  const upperA: DayTemplate = {
    name: "Upper A",
    slots: [
      { key: "upper_hp", label: "Horizontal push", movementPattern: "horizontal_push", isPrimaryCompound: true },
      { key: "upper_hl", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "upper_vp", label: "Vertical push", movementPattern: "vertical_push" },
      { key: "upper_vl", label: "Vertical pull", movementPattern: "vertical_pull" },
      { key: "upper_arms", label: "Arms", includeTags: ["biceps"] },
    ],
  };
  const upperB: DayTemplate = {
    name: "Upper B",
    slots: [
      { key: "upper_vl", label: "Vertical pull", movementPattern: "vertical_pull", isPrimaryCompound: true },
      { key: "upper_vp", label: "Vertical push", movementPattern: "vertical_push", isPrimaryCompound: true },
      { key: "upper_hp", label: "Horizontal push", movementPattern: "horizontal_push" },
      { key: "upper_hl", label: "Horizontal pull", movementPattern: "horizontal_pull" },
      { key: "upper_arms", label: "Arms", includeTags: ["triceps"] },
    ],
  };
  const lowerA: DayTemplate = {
    name: "Lower A",
    slots: [
      { key: "lower_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "lower_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "lower_unilateral", label: "Unilateral legs", includeTags: ["unilateral"], optional: false },
      { key: "lower_calves", label: "Calves", includeTags: ["calves"], optional: true },
      { key: "lower_core", label: "Core/Carry", movementPattern: "carry", optional: true },
    ],
  };
  const lowerB: DayTemplate = {
    name: "Lower B",
    slots: [
      { key: "lower_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "lower_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "lower_hams", label: "Hamstrings", includeTags: ["hamstrings"], optional: false },
      { key: "lower_quads", label: "Quads", includeTags: ["quads"], optional: false },
      { key: "lower_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };

  const fbA: DayTemplate = {
    name: "Full Body A",
    slots: [
      { key: "fb_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "fb_hp", label: "Horizontal push", movementPattern: "horizontal_push", isPrimaryCompound: true },
      { key: "fb_hl", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "fb_core", label: "Core", movementPattern: "core", optional: true },
      { key: "fb_delts", label: "Delts", includeTags: ["lateral_delts"], optional: true },
    ],
  };
  const fbB: DayTemplate = {
    name: "Full Body B",
    slots: [
      { key: "fb_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "fb_vp", label: "Vertical push", movementPattern: "vertical_push", isPrimaryCompound: true },
      { key: "fb_vl", label: "Vertical pull", movementPattern: "vertical_pull", isPrimaryCompound: true },
      { key: "fb_carry", label: "Carry", movementPattern: "carry", optional: true },
      { key: "fb_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };
  const fbC: DayTemplate = {
    name: "Full Body C",
    slots: [
      { key: "fb_squat2", label: "Squat / unilateral", movementPattern: "squat", isPrimaryCompound: true },
      { key: "fb_hp2", label: "Horizontal push", movementPattern: "horizontal_push", isPrimaryCompound: true },
      { key: "fb_hl2", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "fb_hams", label: "Hamstrings", includeTags: ["hamstrings"], optional: true },
      { key: "fb_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };

  const broChest: DayTemplate = {
    name: "Chest + Triceps",
    slots: [
      { key: "bro_chest1", label: "Chest compound", movementPattern: "horizontal_push", isPrimaryCompound: true, includeTags: ["chest"] },
      { key: "bro_chest2", label: "Chest accessory", includeTags: ["chest"] },
      { key: "bro_tri1", label: "Triceps", includeTags: ["triceps"] },
      { key: "bro_delts", label: "Delts", includeTags: ["lateral_delts"], optional: true },
      { key: "bro_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };
  const broBack: DayTemplate = {
    name: "Back + Biceps",
    slots: [
      { key: "bro_vl", label: "Vertical pull", movementPattern: "vertical_pull", isPrimaryCompound: true },
      { key: "bro_hl", label: "Horizontal pull", movementPattern: "horizontal_pull", isPrimaryCompound: true },
      { key: "bro_rear", label: "Rear delts", includeTags: ["rear_delts"] },
      { key: "bro_bi", label: "Biceps", includeTags: ["biceps"] },
      { key: "bro_carry", label: "Carry", movementPattern: "carry", optional: true },
    ],
  };
  const broLegs: DayTemplate = {
    name: "Legs",
    slots: [
      { key: "bro_squat", label: "Squat", movementPattern: "squat", isPrimaryCompound: true },
      { key: "bro_hinge", label: "Hinge", movementPattern: "hinge", isPrimaryCompound: true },
      { key: "bro_quads", label: "Quads", includeTags: ["quads"] },
      { key: "bro_hams", label: "Hamstrings", includeTags: ["hamstrings"] },
      { key: "bro_calves", label: "Calves", includeTags: ["calves"], optional: true },
    ],
  };
  const broShoulders: DayTemplate = {
    name: "Shoulders",
    slots: [
      { key: "bro_vp", label: "Vertical push", movementPattern: "vertical_push", isPrimaryCompound: true },
      { key: "bro_delts", label: "Lateral delts", includeTags: ["lateral_delts"] },
      { key: "bro_rear", label: "Rear delts", includeTags: ["rear_delts"] },
      { key: "bro_tri", label: "Triceps", includeTags: ["triceps"], optional: true },
      { key: "bro_core", label: "Core", movementPattern: "core", optional: true },
    ],
  };
  const broArms: DayTemplate = {
    name: "Arms + Core",
    slots: [
      { key: "bro_bi", label: "Biceps", includeTags: ["biceps"] },
      { key: "bro_tri", label: "Triceps", includeTags: ["triceps"] },
      { key: "bro_bi2", label: "Biceps (variation)", includeTags: ["biceps"], optional: true },
      { key: "bro_tri2", label: "Triceps (variation)", includeTags: ["triceps"], optional: true },
      { key: "bro_core", label: "Core", movementPattern: "core" },
    ],
  };

  if (focus === "push_pull_legs") {
    const cycle = days <= 3 ? [pushA, pullA, legsA] : days === 4 ? [pushA, pullA, legsA, pushB] : days === 5 ? [pushA, pullA, legsA, pushB, pullB] : [pushA, pullA, legsA, pushB, pullB, legsB];
    return cycle.slice(0, days);
  }
  if (focus === "upper_lower") {
    const base = [upperA, lowerA, upperB, lowerB];
    if (days === 4) return base;
    if (days === 3) return [upperA, lowerA, fbB];
    if (days === 5) return [upperA, lowerA, upperB, lowerB, broArms];
    if (days === 6) return [upperA, lowerA, upperB, lowerB, upperA, lowerB];
    return base.slice(0, days);
  }
  if (focus === "bro_split") {
    const base = [broChest, broBack, broLegs, broShoulders, broArms];
    if (days === 5) return base;
    if (days === 4) return [broChest, broBack, broLegs, broShoulders];
    if (days === 3) return [broChest, broBack, broLegs];
    if (days === 6) return [...base, broLegs];
    return base.slice(0, days);
  }

  // full_body + fallbacks
  const fbCycle = days === 2 ? [fbA, fbB] : days === 3 ? [fbA, fbB, fbC] : days === 4 ? [fbA, fbB, fbC, fbA] : days === 5 ? [fbA, fbB, fbC, fbA, fbB] : [fbA, fbB, fbC, fbA, fbB, fbC];
  return fbCycle.slice(0, days);
}

function matchesAvoidList(ex: Exercise, avoid: string | null): boolean {
  const a = avoid ? normalizeExerciseName(avoid) : "";
  if (!a) return false;
  const tokens = a.split(/[,\n]/).map((t) => normalizeExerciseName(t)).filter(Boolean);
  if (!tokens.length) return false;
  const name = normalizeExerciseName(ex.name);
  return tokens.some((t) => t && name.includes(t));
}

function scoreCandidate(params: {
  ex: Exercise;
  goal: Goal;
  experience: Experience;
  mode: "full_gym" | "minimal";
  slot: Slot;
  usedIds: Set<string>;
  usedPrimaryCompounds: Set<string>;
  weekVolume: MuscleVolume;
  targets: MuscleTargets;
  assumedSets: number;
}): number {
  let score = 0;

  // Prefer matching pattern/tags (already filtered), but boost primary compounds in primary slots.
  if (params.slot.isPrimaryCompound && params.ex.tags.includes("primary_compound")) score += 6;
  if (params.slot.isPrimaryCompound && params.ex.tags.includes("compound")) score += 2;
  if (!params.slot.isPrimaryCompound && params.ex.tags.includes("accessory")) score += 1;

  // Goal biases.
  if (params.goal === "performance") {
    if (params.ex.tags.includes("conditioning") || params.ex.tags.includes("carry")) score += 2;
  } else if (params.goal === "lose_fat") {
    if (params.ex.tags.includes("conditioning") || params.ex.movementPattern === "carry") score += 2;
    if (params.ex.tags.includes("primary_compound")) score += 1;
  } else {
    // build muscle / recomp
    if (params.ex.tags.includes("accessory")) score += 1;
    if (params.ex.tags.includes("primary_compound")) score += 1;
  }

  // Experience gating preference (we still allow slightly harder moves if needed).
  const diff = difficultyOrder(params.ex.difficulty) - experienceOrder(params.experience);
  if (diff <= 0) score += 2;
  else if (diff === 1) score += 0;
  else score -= 3;

  // Variety penalties.
  if (params.usedIds.has(params.ex.id)) score -= 6;
  if (params.ex.tags.includes("primary_compound") && params.usedPrimaryCompounds.has(params.ex.id)) score -= 25;

  // Full gym preference: prefer explicitly tagged full_gym unless minimal.
  if (params.mode === "full_gym") {
    if (params.ex.tags.includes("full_gym")) score += 1;
  }

  // Volume steering: gently prefer muscles that are under target, and avoid over-shooting.
  const delta = exerciseMuscleContribution(params.ex, params.assumedSets);
  for (const group of Object.keys(delta) as MuscleGroup[]) {
    const add = delta[group] ?? 0;
    if (!add) continue;
    const cur = params.weekVolume[group] ?? 0;
    const target = params.targets[group];
    if (cur < target.min) {
      score += Math.min(6, (target.min - cur) * 0.35);
    } else if (cur > target.max) {
      score -= Math.min(6, (cur - target.max) * 0.35);
    }
  }

  return score;
}

function pickExerciseForSlot(params: {
  seed: string;
  slot: Slot;
  goal: Goal;
  experience: Experience;
  mode: "full_gym" | "minimal";
  allowedEquipment: Set<Equipment>;
  avoidExercises: string | null;
  usedIds: Set<string>;
  usedPrimaryCompounds: Set<string>;
  perDayPatternCounts: Record<MovementPattern, number>;
  weekVolume: MuscleVolume;
  targets: MuscleTargets;
}): Exercise | null {
  const baseFilter = (list: Exercise[]) =>
    list.filter((ex) => {
      if (matchesAvoidList(ex, params.avoidExercises)) return false;
      // Guardrail: avoid stacking too many hinges/squats in one day.
      if ((params.slot.movementPattern === "hinge" || ex.movementPattern === "hinge") && (params.perDayPatternCounts.hinge ?? 0) >= 1) {
        if (params.slot.isPrimaryCompound) return false;
      }
      if ((params.slot.movementPattern === "squat" || ex.movementPattern === "squat") && (params.perDayPatternCounts.squat ?? 0) >= 2) {
        return false;
      }
      // Guardrail: avoid 3+ push or pull patterns in one session.
      const pushCount = (params.perDayPatternCounts.horizontal_push ?? 0) + (params.perDayPatternCounts.vertical_push ?? 0);
      const pullCount = (params.perDayPatternCounts.horizontal_pull ?? 0) + (params.perDayPatternCounts.vertical_pull ?? 0);
      if ((ex.movementPattern === "horizontal_push" || ex.movementPattern === "vertical_push") && pushCount >= 2 && !params.slot.isPrimaryCompound) {
        return false;
      }
      if ((ex.movementPattern === "horizontal_pull" || ex.movementPattern === "vertical_pull") && pullCount >= 2 && !params.slot.isPrimaryCompound) {
        return false;
      }
      return true;
    });

  // Passes: strict equipment -> broad equipment -> allow repeats.
  const passes: Array<{
    relaxEquipment: boolean;
    allowRepeatPrimary: boolean;
    allowHarderMoves: boolean;
  }> = [
    { relaxEquipment: false, allowRepeatPrimary: false, allowHarderMoves: false },
    { relaxEquipment: true, allowRepeatPrimary: false, allowHarderMoves: true },
    { relaxEquipment: true, allowRepeatPrimary: true, allowHarderMoves: true },
  ];

  for (const pass of passes) {
    const equipment = pass.relaxEquipment
      ? params.mode === "minimal"
        ? new Set<Equipment>(["dumbbell", "bodyweight"])
        : new Set<Equipment>(["barbell", "dumbbell", "machine", "cables", "smith", "bodyweight", "kettlebell"])
      : params.allowedEquipment;

    // Use the substitution pool as a "front of line" for better swaps/consistency.
    const substitution =
      params.slot.movementPattern
        ? getSubstitutionPool({ movementPattern: params.slot.movementPattern, equipment })
        : [];

    const searched = searchExercises({
      query: "",
      movementPattern: params.slot.movementPattern ?? null,
      includeTags: params.slot.includeTags,
      equipment,
      mode: params.mode,
      limit: 200,
    });

    const candidates = baseFilter([...substitution, ...searched]).filter((ex) => {
      if (!pass.allowRepeatPrimary && ex.tags.includes("primary_compound") && params.usedPrimaryCompounds.has(ex.id)) return false;
      if (!pass.allowHarderMoves) {
        const diff = difficultyOrder(ex.difficulty) - experienceOrder(params.experience);
        if (diff >= 2) return false;
      }
      return true;
    });

    if (!candidates.length) continue;

    const assumedSets = setsRepsForSlot({
      goal: params.goal,
      experience: params.experience,
      isPrimaryCompound: Boolean(params.slot.isPrimaryCompound),
      movementPattern: params.slot.movementPattern,
      includeTags: params.slot.includeTags,
    }).sets;

    // Deterministic ranking with stable shuffle tie-break.
    const ranked = candidates
      .map((ex) => ({
        ex,
        score: scoreCandidate({
          ex,
          goal: params.goal,
          experience: params.experience,
          mode: params.mode,
          slot: params.slot,
          usedIds: params.usedIds,
          usedPrimaryCompounds: params.usedPrimaryCompounds,
          weekVolume: params.weekVolume,
          targets: params.targets,
          assumedSets,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    const topScore = ranked[0]!.score;
    const topBand = ranked.filter((r) => r.score >= topScore - 2).map((r) => r.ex);
    const shuffled = stableShuffle(topBand, `${params.seed}::${params.slot.key}`);
    return shuffled[0] ?? ranked[0]!.ex;
  }

  return null;
}

export function generateCustomPlanDaysFromLibrary(
  prefs: CustomPlanPrefs,
  options?: { variant?: number }
): CatalogPlanDay[] {
  const daysPerWeek = clampInt(prefs.daysPerWeek, 2, 6, 4);
  const weekdays = (Array.isArray(prefs.preferredDays) && prefs.preferredDays.length ? prefs.preferredDays : pickWeekdays(daysPerWeek)).slice(0, daysPerWeek) as CatalogPlanDay["day"][];
  const focus = (prefs.focus ?? "full_body") as Focus;
  const goal = (prefs.goal ?? "build_muscle") as Goal;
  const experience = (prefs.experience ?? "beginner") as Experience;
  const { mode, allowed } = allowedEquipFromPrefs(prefs);
  const maxMoves = maxMovesForTime(prefs.timePerWorkout);
  const targets = volumeTargets({ goal, experience, daysPerWeek, focus });

  // Seed should be stable across regenerations for same prefs, but vary with preferredDays (user schedule).
  const variant = clampInt(options?.variant ?? 0, 0, 50, 0);
  const seedBase = normalizeExerciseName(
    JSON.stringify({
      goal,
      experience,
      focus,
      daysPerWeek,
      timePerWorkout: prefs.timePerWorkout ?? "45",
      mode,
      variant,
      preferredDays: weekdays,
    })
  );

  const templates = buildTemplates(focus, daysPerWeek);
  const usedIds = new Set<string>();
  const usedPrimaryCompounds = new Set<string>();
  const weekVolume: MuscleVolume = emptyVolume();

  return weekdays.map((day, dayIdx) => {
    const template = templates[dayIdx % templates.length]!;
    const perDayPatternCounts: Record<MovementPattern, number> = {
      squat: 0,
      hinge: 0,
      horizontal_push: 0,
      vertical_push: 0,
      horizontal_pull: 0,
      vertical_pull: 0,
      carry: 0,
      core: 0,
    };

    const chosen: CatalogPlanExercise[] = [];
    const slots = template.slots.slice(0);

    for (const slot of slots) {
      if (chosen.length >= maxMoves) break;
      if (slot.optional && chosen.length >= maxMoves - 0) {
        // Optional moves are trimmed by time cap automatically.
        // We keep this branch for clarity; no-op.
      }

      // If the slot is optional and we're already at the cap, skip it.
      if (slot.optional && chosen.length >= maxMoves) continue;

      const picked = pickExerciseForSlot({
        seed: `${seedBase}::${day}::${template.name}`,
        slot,
        goal,
        experience,
        mode,
        allowedEquipment: allowed,
        avoidExercises: prefs.avoidExercises ?? null,
        usedIds,
        usedPrimaryCompounds,
        perDayPatternCounts,
        weekVolume,
        targets,
      });

      const fallbackName =
        slot.movementPattern === "core"
          ? "Plank"
          : slot.movementPattern === "carry"
            ? "Farmer’s Carry (Dumbbells)"
            : slot.label;

      const ex = picked ?? getExerciseByExactName(fallbackName);
      if (!ex) {
        chosen.push({ name: fallbackName, sets: 3, reps: "10" });
        continue;
      }

      const sr = setsRepsForSlot({
        goal,
        experience,
        isPrimaryCompound: Boolean(slot.isPrimaryCompound && ex.tags.includes("primary_compound")),
        movementPattern: ex.movementPattern,
        includeTags: slot.includeTags,
      });

      chosen.push({ name: ex.name, sets: sr.sets, reps: sr.reps });

      usedIds.add(ex.id);
      if (slot.isPrimaryCompound && ex.tags.includes("primary_compound")) {
        usedPrimaryCompounds.add(ex.id);
      }
      perDayPatternCounts[ex.movementPattern] = (perDayPatternCounts[ex.movementPattern] ?? 0) + 1;
      addVolume(weekVolume, exerciseMuscleContribution(ex, sr.sets));
    }

    // Guardrail: ensure at least 1 exercise exists.
    if (!chosen.length) {
      chosen.push({ name: "Plank", sets: 3, reps: "30-45s" });
    }

    return { day, exercises: chosen.slice(0, 12) };
  });
}

export function buildCustomPlanTitleFromPrefs(prefs: CustomPlanPrefs): string {
  const goal =
    prefs.goal === "lose_fat"
      ? "Lean Out"
      : prefs.goal === "build_muscle"
        ? "Build Muscle"
        : prefs.goal === "performance"
          ? "Performance"
          : prefs.goal === "recomp"
            ? "Recomp"
            : "Custom";
  const focus =
    prefs.focus === "upper_lower"
      ? "Upper / Lower"
      : prefs.focus === "push_pull_legs"
        ? "Push Pull Legs"
        : prefs.focus === "full_body"
          ? "Full Body"
          : prefs.focus === "bro_split"
            ? "Bro Split"
            : "Plan";
  return `${goal} • ${focus}`;
}

