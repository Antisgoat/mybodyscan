import type {
  Program,
  ProgramEquipment,
  ProgramGoal,
  ProgramLevel,
} from "@app/lib/coach/types.ts";

export type ProgramMeta = {
  id: string;
  title: string;
  goal: ProgramGoal;
  level: ProgramLevel;
  daysPerWeek: number;
  weeks: number;
  equipment: ProgramEquipment[];
  durationPerSessionMin: number;
  tags: string[];
  heroImg?: string;
};

export type CatalogEntry = {
  meta: ProgramMeta;
  program: Program;
};

type ProgramModule = Program;

const DEFAULT_LEVEL: ProgramLevel = "beginner";
const DEFAULT_DURATION = 45;
const DEFAULT_EQUIPMENT: ProgramEquipment[] = ["none"];

const modules = import.meta.glob<ProgramModule>("@app/content/programs/*.json", {
  eager: true,
  import: "default",
});

let cachedPrograms: CatalogEntry[] | null = null;

function averageDaysPerWeek(program: Program): number {
  const weeks = program.weeks.length;
  if (!weeks) return 0;
  const totalDays = program.weeks.reduce((acc, week) => acc + (week.days?.length ?? 0), 0);
  if (!totalDays) return 0;
  return Math.max(1, Math.round(totalDays / weeks));
}

function resolveLevel(program: Program): ProgramLevel {
  return program.level ?? DEFAULT_LEVEL;
}

function resolveEquipment(program: Program): ProgramEquipment[] {
  if (program.equipment?.length) {
    return [...new Set(program.equipment)];
  }
  return DEFAULT_EQUIPMENT;
}

function resolveDuration(program: Program): number {
  return program.durationPerSessionMin ?? DEFAULT_DURATION;
}

function resolveTags(program: Program): string[] {
  return program.tags ?? [];
}

function buildMeta(program: Program): ProgramMeta {
  return {
    id: program.id,
    title: program.title,
    goal: program.goal,
    level: resolveLevel(program),
    daysPerWeek: averageDaysPerWeek(program),
    weeks: program.weeks.length,
    equipment: resolveEquipment(program),
    durationPerSessionMin: resolveDuration(program),
    tags: resolveTags(program),
    heroImg: program.heroImg,
  };
}

export async function loadAllPrograms(): Promise<CatalogEntry[]> {
  if (cachedPrograms) {
    return cachedPrograms;
  }

  const records: CatalogEntry[] = Object.values(modules).map((program) => {
    const meta = buildMeta(program);
    return { meta, program };
  });

  cachedPrograms = records;
  return records;
}

const LEVEL_ORDER: Record<ProgramLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const SCORE_WEIGHTS = {
  goal: 35,
  level: 20,
  days: 15,
  equipment: 20,
  time: 10,
} as const;

export function matchScore(
  meta: ProgramMeta,
  prefs: {
    goal?: ProgramGoal;
    level?: ProgramLevel;
    days?: number;
    equipment?: ProgramEquipment[];
    time?: number;
  }
): number {
  let score = 0;
  let maxScore = 0;

  if (prefs.goal) {
    maxScore += SCORE_WEIGHTS.goal;
    if (meta.goal === prefs.goal) {
      score += SCORE_WEIGHTS.goal;
    } else if (prefs.goal === "general" && meta.goal !== "general") {
      score += SCORE_WEIGHTS.goal * 0.5;
    }
  }

  if (prefs.level) {
    maxScore += SCORE_WEIGHTS.level;
    const target = LEVEL_ORDER[prefs.level];
    const programLevel = LEVEL_ORDER[meta.level] ?? LEVEL_ORDER[DEFAULT_LEVEL];
    const distance = Math.abs(target - programLevel);
    if (distance === 0) {
      score += SCORE_WEIGHTS.level;
    } else if (distance === 1) {
      score += SCORE_WEIGHTS.level * 0.6;
    } else if (distance === 2) {
      score += SCORE_WEIGHTS.level * 0.25;
    }
  }

  if (typeof prefs.days === "number" && !Number.isNaN(prefs.days)) {
    maxScore += SCORE_WEIGHTS.days;
    const diff = Math.abs(meta.daysPerWeek - prefs.days);
    if (diff === 0) {
      score += SCORE_WEIGHTS.days;
    } else if (diff === 1) {
      score += SCORE_WEIGHTS.days * 0.7;
    } else if (diff === 2) {
      score += SCORE_WEIGHTS.days * 0.35;
    }
  }

  if (prefs.equipment && prefs.equipment.length) {
    maxScore += SCORE_WEIGHTS.equipment;
    const required = meta.equipment.filter((item) => item !== "none");
    if (!required.length) {
      score += SCORE_WEIGHTS.equipment;
    } else {
      const owned = new Set(prefs.equipment);
      const missing = required.filter((item) => !owned.has(item));
      if (missing.length === 0) {
        score += SCORE_WEIGHTS.equipment;
      } else if (missing.length < required.length) {
        score += SCORE_WEIGHTS.equipment * 0.5;
      }
    }
  }

  if (typeof prefs.time === "number" && prefs.time > 0) {
    maxScore += SCORE_WEIGHTS.time;
    if (meta.durationPerSessionMin <= prefs.time) {
      score += SCORE_WEIGHTS.time;
    } else if (meta.durationPerSessionMin <= prefs.time + 10) {
      score += SCORE_WEIGHTS.time * 0.5;
    }
  }

  if (maxScore === 0) {
    return 50;
  }

  return Math.round((score / maxScore) * 100);
}
