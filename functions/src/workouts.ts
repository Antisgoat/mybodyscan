/**
 * Pipeline map — Workout plan generation & adjustments:
 * - Generates plans after scans or onboarding using deterministic templates or OpenAI text, storing them under `users/{uid}/workoutPlans`.
 * - Exposes HTTPS endpoints for generating/applying catalog plans, fetching current plans/progress, and marking exercises done.
 * - `adjustWorkout` reuses OpenAI to suggest per-day intensity/volume tweaks based on body feel, falling back to deterministic logic.
 */
import { randomUUID } from "crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "./firebase.js";
import { errorCode, statusFromCode } from "./lib/errors.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth, requireAuthWithClaims } from "./http.js";
import type { WorkoutDay, WorkoutPlan } from "./types.js";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { ensureSoftAppCheckFromRequest } from "./lib/appCheckSoft.js";
import { hasOpenAI } from "./lib/env.js";
import { scrubUndefined } from "./lib/scrub.js";
import {
  hasActiveSubscriptionFromUserDoc,
  hasUnlimitedAccessFromClaims,
} from "./lib/entitlements.js";
import { structuredJsonChat } from "./openai/client.js";

const db = getFirestore();
type BodyFeel = "great" | "ok" | "tired" | "sore";
const BODY_FEEL_VALUES: BodyFeel[] = ["great", "ok", "tired", "sore"];
const BODY_FEEL_SET = new Set<BodyFeel>(BODY_FEEL_VALUES);
const ADJUST_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ADJUST_TIMEOUT_MS = 8_000;
const PLAN_TIMEOUT_MS = 10_000;
const MAX_NOTE_LENGTH = 400;
const VALID_CATALOG_DAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
const VALID_CATALOG_DAY_SET = new Set<string>(VALID_CATALOG_DAYS);

type AdjustmentMods = {
  intensity: number;
  volume: number;
  summary?: string | null;
};

interface PlanPrefs {
  focus?: "back" | "legs" | "core" | "full";
  equipment?: "none" | "dumbbells" | "bands" | "gym";
  daysPerWeek?: number;
  injuries?: string[];
}

type CustomPlanGoal = "lose_fat" | "build_muscle" | "recomp" | "performance";
type CustomPlanExperience = "beginner" | "intermediate" | "advanced";
type CustomPlanStyle =
  | "strength"
  | "hypertrophy"
  | "athletic"
  | "minimal_equipment"
  | "balanced";
type CustomFocus =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "custom_emphasis";

interface CustomPlanPrefs {
  goal?: CustomPlanGoal;
  daysPerWeek?: number;
  preferredDays?: string[];
  timePerWorkout?: "30" | "45" | "60" | "75+";
  equipment?: string[];
  trainingStyle?: CustomPlanStyle;
  experience?: CustomPlanExperience;
  focus?: CustomFocus;
  emphasis?: string[];
  injuries?: string | null;
  avoidExercises?: string | null;
  cardioPreference?: string | null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.max(min, Math.min(max, rounded));
}

function uniqStrings(values: unknown, maxItems: number, maxLen = 24): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const sliced = trimmed.slice(0, maxLen);
    const key = sliced.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sliced);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeCustomPrefs(raw: any): CustomPlanPrefs {
  const prefs: CustomPlanPrefs = {};
  const goal = typeof raw?.goal === "string" ? raw.goal.trim() : "";
  if (
    goal === "lose_fat" ||
    goal === "build_muscle" ||
    goal === "recomp" ||
    goal === "performance"
  ) {
    prefs.goal = goal;
  }
  prefs.daysPerWeek = clampInt(raw?.daysPerWeek, 2, 6, 4);
  prefs.preferredDays = uniqStrings(raw?.preferredDays, 7, 3).filter((d) =>
    VALID_CATALOG_DAY_SET.has(d)
  );
  const time = typeof raw?.timePerWorkout === "string" ? raw.timePerWorkout : "";
  if (time === "30" || time === "45" || time === "60" || time === "75+") {
    prefs.timePerWorkout = time;
  }
  prefs.equipment = uniqStrings(raw?.equipment, 8, 32);
  const style = typeof raw?.trainingStyle === "string" ? raw.trainingStyle : "";
  if (
    style === "strength" ||
    style === "hypertrophy" ||
    style === "athletic" ||
    style === "minimal_equipment" ||
    style === "balanced"
  ) {
    prefs.trainingStyle = style;
  }
  const exp = typeof raw?.experience === "string" ? raw.experience : "";
  if (exp === "beginner" || exp === "intermediate" || exp === "advanced") {
    prefs.experience = exp;
  }
  const focus = typeof raw?.focus === "string" ? raw.focus : "";
  if (
    focus === "full_body" ||
    focus === "upper_lower" ||
    focus === "push_pull_legs" ||
    focus === "custom_emphasis"
  ) {
    prefs.focus = focus;
  }
  prefs.emphasis = uniqStrings(raw?.emphasis, 5, 18);
  prefs.injuries =
    typeof raw?.injuries === "string" && raw.injuries.trim().length
      ? raw.injuries.trim().slice(0, 240)
      : null;
  prefs.avoidExercises =
    typeof raw?.avoidExercises === "string" && raw.avoidExercises.trim().length
      ? raw.avoidExercises.trim().slice(0, 240)
      : null;
  prefs.cardioPreference =
    typeof raw?.cardioPreference === "string" && raw.cardioPreference.trim().length
      ? raw.cardioPreference.trim().slice(0, 120)
      : null;
  return prefs;
}

type PlanDayTemplate = {
  name: string;
  exercises: Array<{ name: string; sets: number; reps: string }>;
};

const CUSTOM_TEMPLATES: Record<
  CustomFocus,
  {
    label: string;
    days: Record<number, PlanDayTemplate[]>;
  }
> = {
  full_body: {
    label: "Full Body",
    days: {
      2: [
        {
          name: "Full Body A",
          exercises: [
            { name: "Squat pattern", sets: 3, reps: "8-12" },
            { name: "Push", sets: 3, reps: "8-12" },
            { name: "Pull", sets: 3, reps: "8-12" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
        {
          name: "Full Body B",
          exercises: [
            { name: "Hinge pattern", sets: 3, reps: "8-12" },
            { name: "Push", sets: 3, reps: "8-12" },
            { name: "Pull", sets: 3, reps: "8-12" },
            { name: "Carry", sets: 3, reps: "30-60s" },
          ],
        },
      ],
      3: [
        {
          name: "Full Body A",
          exercises: [
            { name: "Squat pattern", sets: 3, reps: "6-10" },
            { name: "Horizontal push", sets: 3, reps: "8-12" },
            { name: "Horizontal pull", sets: 3, reps: "8-12" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
        {
          name: "Full Body B",
          exercises: [
            { name: "Hinge pattern", sets: 3, reps: "6-10" },
            { name: "Vertical push", sets: 3, reps: "8-12" },
            { name: "Vertical pull", sets: 3, reps: "8-12" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
        {
          name: "Full Body C",
          exercises: [
            { name: "Single-leg", sets: 3, reps: "8-12" },
            { name: "Push", sets: 3, reps: "10-15" },
            { name: "Pull", sets: 3, reps: "10-15" },
            { name: "Conditioning", sets: 1, reps: "8-12 min" },
          ],
        },
      ],
      4: [
        {
          name: "Full Body A",
          exercises: [
            { name: "Squat pattern", sets: 4, reps: "6-10" },
            { name: "Push", sets: 3, reps: "8-12" },
            { name: "Pull", sets: 3, reps: "8-12" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
        {
          name: "Full Body B",
          exercises: [
            { name: "Hinge pattern", sets: 4, reps: "6-10" },
            { name: "Push", sets: 3, reps: "8-12" },
            { name: "Pull", sets: 3, reps: "8-12" },
            { name: "Carry", sets: 3, reps: "30-60s" },
          ],
        },
        {
          name: "Full Body C",
          exercises: [
            { name: "Single-leg", sets: 3, reps: "8-12" },
            { name: "Push", sets: 3, reps: "10-15" },
            { name: "Pull", sets: 3, reps: "10-15" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
        {
          name: "Full Body D",
          exercises: [
            { name: "Upper accessory", sets: 3, reps: "12-15" },
            { name: "Lower accessory", sets: 3, reps: "12-15" },
            { name: "Conditioning", sets: 1, reps: "10-15 min" },
          ],
        },
      ],
      5: [],
      6: [],
    },
  },
  upper_lower: {
    label: "Upper / Lower",
    days: {
      2: [
        {
          name: "Upper",
          exercises: [
            { name: "Horizontal push", sets: 4, reps: "6-10" },
            { name: "Horizontal pull", sets: 4, reps: "8-12" },
            { name: "Vertical push", sets: 3, reps: "8-12" },
            { name: "Vertical pull", sets: 3, reps: "8-12" },
          ],
        },
        {
          name: "Lower",
          exercises: [
            { name: "Squat pattern", sets: 4, reps: "6-10" },
            { name: "Hinge pattern", sets: 4, reps: "6-10" },
            { name: "Single-leg", sets: 3, reps: "8-12" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
      ],
      3: [],
      4: [
        {
          name: "Upper A",
          exercises: [
            { name: "Horizontal push", sets: 4, reps: "6-10" },
            { name: "Horizontal pull", sets: 4, reps: "8-12" },
            { name: "Arms", sets: 3, reps: "10-15" },
          ],
        },
        {
          name: "Lower A",
          exercises: [
            { name: "Squat pattern", sets: 4, reps: "6-10" },
            { name: "Single-leg", sets: 3, reps: "8-12" },
            { name: "Calves", sets: 3, reps: "12-20" },
          ],
        },
        {
          name: "Upper B",
          exercises: [
            { name: "Vertical push", sets: 4, reps: "6-10" },
            { name: "Vertical pull", sets: 4, reps: "8-12" },
            { name: "Upper back", sets: 3, reps: "12-15" },
          ],
        },
        {
          name: "Lower B",
          exercises: [
            { name: "Hinge pattern", sets: 4, reps: "6-10" },
            { name: "Hamstrings", sets: 3, reps: "10-15" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
      ],
      5: [],
      6: [],
    },
  },
  push_pull_legs: {
    label: "Push / Pull / Legs",
    days: {
      3: [
        {
          name: "Push",
          exercises: [
            { name: "Horizontal push", sets: 4, reps: "6-10" },
            { name: "Vertical push", sets: 3, reps: "8-12" },
            { name: "Triceps", sets: 3, reps: "10-15" },
          ],
        },
        {
          name: "Pull",
          exercises: [
            { name: "Horizontal pull", sets: 4, reps: "8-12" },
            { name: "Vertical pull", sets: 3, reps: "8-12" },
            { name: "Biceps", sets: 3, reps: "10-15" },
          ],
        },
        {
          name: "Legs",
          exercises: [
            { name: "Squat pattern", sets: 4, reps: "6-10" },
            { name: "Hinge pattern", sets: 3, reps: "6-10" },
            { name: "Core", sets: 3, reps: "30-45s" },
          ],
        },
      ],
      4: [],
      5: [],
      6: [],
    },
  },
  custom_emphasis: {
    label: "Custom",
    days: { 2: [], 3: [], 4: [], 5: [], 6: [] },
  },
};

function defaultPreferredDays(count: number): string[] {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return weekdays.slice(0, Math.max(2, Math.min(count, 6)));
}

function buildCustomPlanTitle(prefs: CustomPlanPrefs): string {
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
          : "Plan";
  return `${goal} • ${focus}`;
}

function toWorkoutDaysFromTemplates(
  prefs: CustomPlanPrefs,
  templates: PlanDayTemplate[]
): WorkoutDay[] {
  const daysPerWeek = clampInt(prefs.daysPerWeek, 2, 6, 4);
  const preferredDays =
    prefs.preferredDays && prefs.preferredDays.length
      ? prefs.preferredDays
      : defaultPreferredDays(daysPerWeek);
  const days = preferredDays.slice(0, daysPerWeek);
  const pickedTemplates = templates.length
    ? templates
    : CUSTOM_TEMPLATES.full_body.days[3] ?? [];
  return days.map((dayName, index) => {
    const template = pickedTemplates[index % pickedTemplates.length];
    const exercises = (template?.exercises?.length
      ? template.exercises
      : [
          { name: "Session", sets: 3, reps: "10" },
          { name: "Accessory", sets: 3, reps: "10-12" },
          { name: "Core", sets: 3, reps: "30-45s" },
        ]
    ).slice(0, 12);
    return {
      day: dayName,
      exercises: exercises.map((ex) => ({
        id: randomUUID(),
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
      })),
    };
  });
}

function generateCustomPlanDays(prefs: CustomPlanPrefs): WorkoutDay[] {
  const focus = prefs.focus ?? "full_body";
  const daysPerWeek = clampInt(prefs.daysPerWeek, 2, 6, 4);
  const templatesForFocus = CUSTOM_TEMPLATES[focus]?.days?.[daysPerWeek] ?? [];
  if (templatesForFocus.length) {
    return toWorkoutDaysFromTemplates(prefs, templatesForFocus);
  }
  // Fallback: use full-body template at the requested frequency.
  const fallbackTemplates =
    CUSTOM_TEMPLATES.full_body.days[daysPerWeek] ??
    CUSTOM_TEMPLATES.full_body.days[3] ??
    [];
  return toWorkoutDaysFromTemplates(prefs, fallbackTemplates);
}

async function requireProgramsEntitlement(uid: string, claims: any) {
  // Eligibility: active subscription OR unlimited credits claim.
  // Keep this logic server-side so UI gating can't be bypassed.
  try {
    const unlimited = hasUnlimitedAccessFromClaims(claims);
    if (!unlimited) {
      const userSnap = await db.doc(`users/${uid}`).get();
      const active = hasActiveSubscriptionFromUserDoc(userSnap.data());
      if (!active) {
        throw new HttpsError(
          "permission-denied",
          "Your account can't start programs yet. Visit Plans to activate your account."
        );
      }
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    // If eligibility reads fail (rare), fail closed but with a neutral message.
    throw new HttpsError(
      "unavailable",
      "Programs are temporarily unavailable. Please try again or contact support."
    );
  }
}

function deterministicPlan(prefs: PlanPrefs): WorkoutDay[] {
  const focus = prefs.focus || "full";
  const baseExercises =
    focus === "back"
      ? [
          { id: randomUUID(), name: "Pull Ups", sets: 3, reps: 8 },
          { id: randomUUID(), name: "Bent Over Row", sets: 3, reps: 10 },
          { id: randomUUID(), name: "Face Pull", sets: 3, reps: 12 },
        ]
      : [
          { id: randomUUID(), name: "Goblet Squat", sets: 3, reps: 12 },
          { id: randomUUID(), name: "Reverse Lunge", sets: 3, reps: 10 },
          { id: randomUUID(), name: "Plank", sets: 3, reps: 45 },
        ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const limit = Math.max(2, Math.min(prefs.daysPerWeek || 4, 6));
  return days.slice(0, limit).map((day, index) => ({
    day,
    exercises: baseExercises.map((ex, idx) => ({
      ...ex,
      id: `${ex.id}-${index}-${idx}`,
    })),
  }));
}

function clampDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Math.max(-2, Math.min(2, rounded));
}

function describeDay(day: WorkoutDay | null): string {
  if (!day) {
    return "No workout found for this day.";
  }
  if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
    return `Day ${day.day}: no exercises recorded.`;
  }
  const items = day.exercises.map((exercise, index) => {
    const name =
      typeof exercise?.name === "string" && exercise.name.trim().length
        ? exercise.name
        : `Movement ${index + 1}`;
    const sets = typeof exercise?.sets === "number" ? exercise.sets : "-";
    const reps =
      typeof exercise?.reps === "string" || typeof exercise?.reps === "number"
        ? exercise.reps
        : "-";
    return `${index + 1}. ${name} – ${sets} x ${reps}`;
  });
  return `Day ${day.day}: ${items.join("; ")}`;
}

function parseAdjustmentPayload(raw: any): AdjustmentMods {
  const intensity = clampDelta(
    Number(
      raw?.intensity ??
        raw?.intensityDelta ??
        raw?.intensity_delta ??
        raw?.intensityAdjustment
    )
  );
  const volume = clampDelta(
    Number(
      raw?.volume ??
        raw?.volumeDelta ??
        raw?.volume_delta ??
        raw?.volumeAdjustment
    )
  );
  const summarySource =
    typeof raw?.summary === "string"
      ? raw.summary
      : typeof raw?.message === "string"
        ? raw.message
        : typeof raw?.notes === "string"
          ? raw.notes
          : null;
  const summary = summarySource ? summarySource.trim().slice(0, 240) : null;
  return { intensity, volume, summary };
}

function validateAdjustmentResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_adjustment_payload");
  }
  return raw as Record<string, unknown>;
}

function normalizeBodyFeel(value: unknown): BodyFeel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return BODY_FEEL_SET.has(normalized as BodyFeel)
    ? (normalized as BodyFeel)
    : null;
}

function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function fallbackMods(bodyFeel: BodyFeel): {
  intensity: number;
  volume: number;
} {
  return {
    intensity:
      bodyFeel === "great"
        ? 1
        : bodyFeel === "tired" || bodyFeel === "sore"
          ? -1
          : 0,
    volume: bodyFeel === "great" ? 1 : bodyFeel === "sore" ? -1 : 0,
  };
}

type CatalogExercisePayload = {
  name?: string;
  sets?: number;
  reps?: number | string;
};
type CatalogDayPayload = { day?: string; exercises?: CatalogExercisePayload[] };

function sanitizeCatalogPlan(payload: any): {
  programId: string;
  title?: string;
  goal?: string;
  level?: string;
  days: WorkoutDay[];
} {
  if (!payload || typeof payload !== "object") {
    throw new HttpsError("invalid-argument", "Missing plan payload.");
  }
  const programId =
    typeof payload.programId === "string" && payload.programId.trim().length
      ? payload.programId.trim().slice(0, 80)
      : null;
  if (!programId) {
    throw new HttpsError("invalid-argument", "programId is required.");
  }
  const title =
    typeof payload.title === "string" && payload.title.trim().length
      ? payload.title.trim().slice(0, 80)
      : undefined;
  const goal =
    typeof payload.goal === "string" && payload.goal.trim().length
      ? payload.goal.trim().slice(0, 40)
      : undefined;
  const level =
    typeof payload.level === "string" && payload.level.trim().length
      ? payload.level.trim().slice(0, 40)
      : undefined;
  const rawDays: CatalogDayPayload[] = Array.isArray(payload.days)
    ? payload.days
    : [];
  if (!rawDays.length) {
    throw new HttpsError(
      "invalid-argument",
      "At least one training day is required."
    );
  }
  if (rawDays.length > 7) {
    throw new HttpsError("invalid-argument", "Too many training days.");
  }
  const days: WorkoutDay[] = rawDays.map((day, index) => {
    const dayName = typeof day?.day === "string" ? day.day.trim() : "";
    if (!VALID_CATALOG_DAY_SET.has(dayName)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid day value at index ${index}.`
      );
    }
    const rawExercises: CatalogExercisePayload[] = Array.isArray(day?.exercises)
      ? day.exercises
      : [];
    if (!rawExercises.length) {
      throw new HttpsError(
        "invalid-argument",
        `Each day requires at least one exercise (${dayName}).`
      );
    }
    const exercises = rawExercises.slice(0, 12).map((exercise, exerciseIdx) => {
      const name =
        typeof exercise?.name === "string" && exercise.name.trim().length
          ? exercise.name.trim().slice(0, 80)
          : `Exercise ${exerciseIdx + 1}`;
      const setsRaw = Number(exercise?.sets);
      const sets =
        Number.isFinite(setsRaw) && setsRaw > 0 ? Math.min(setsRaw, 10) : 3;
      const reps =
        typeof exercise?.reps === "string" && exercise.reps.trim().length
          ? exercise.reps.trim().slice(0, 40)
          : Number.isFinite(exercise?.reps)
            ? Number(exercise?.reps)
            : "10";
      return {
        id: randomUUID(),
        name,
        sets,
        reps,
      };
    });
    return {
      day: dayName,
      exercises,
    };
  });

  return {
    programId,
    title,
    goal,
    level,
    days,
  };
}

async function requestAiAdjustment(input: {
  uid: string;
  requestId: string;
  bodyFeel: BodyFeel;
  notes: string | null;
  day: WorkoutDay | null;
}): Promise<AdjustmentMods> {
  const prompt = [
    `Body feel: ${input.bodyFeel}`,
    `Notes: ${input.notes ?? "none provided"}`,
    describeDay(input.day),
    "Respond with JSON only.",
  ].join("\n");

  const { data } = await structuredJsonChat<Record<string, unknown>>({
    systemPrompt:
      'You fine-tune strength training plans. Respond with compact JSON shaped as {"intensity":-2..2,"volume":-2..2,"summary":"<=160 chars"}. Positive numbers increase stress, negative ease up.',
    userContent: prompt,
    temperature: 0.2,
    maxTokens: 320,
    userId: input.uid,
    requestId: input.requestId,
    timeoutMs: ADJUST_TIMEOUT_MS,
    model: ADJUST_MODEL,
    validate: validateAdjustmentResponse,
  });

  return parseAdjustmentPayload(data);
}

const PLAN_SYSTEM_PROMPT = [
  "You design pragmatic progressive overload workout plans.",
  'Respond with JSON matching {"days":[{"day":"Mon","exercises":[{"name":"Goblet Squat","sets":3,"reps":"10"}]}]}.',
  'Provide 3-6 days max, each with 3-5 exercises. Keep reps as short strings (e.g. "8-12" or "10").',
  "Return JSON only with no markdown fences or prose.",
].join("\n");

type AiPlanSchema = { days: unknown[] };

function validatePlanResponse(raw: unknown): AiPlanSchema {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const days = (raw as { days?: unknown[] }).days;
    if (Array.isArray(days)) {
      return { days };
    }
  }
  if (Array.isArray(raw)) {
    return { days: raw };
  }
  throw new Error("invalid_plan_payload");
}

function buildPlanPrompt(prefs: PlanPrefs): string {
  const focus = prefs.focus || "balanced";
  const equipment = prefs.equipment || "bodyweight";
  const daysPerWeek = Math.max(2, Math.min(prefs.daysPerWeek || 4, 6));
  const injuries =
    Array.isArray(prefs.injuries) && prefs.injuries.length
      ? prefs.injuries.join(", ")
      : "none";
  return [
    `Goal focus: ${focus}`,
    `Equipment: ${equipment}`,
    `Days per week: ${daysPerWeek}`,
    `Injuries/notes: ${injuries}`,
    "Each day should include a title (Mon-Sun) and exercises with name, sets (number), and reps (string).",
  ].join("\n");
}

function adaptAiPlanDays(days: unknown[]): WorkoutDay[] {
  return days
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    )
    .map((item) => {
      const exercisesRaw = Array.isArray(item.exercises) ? item.exercises : [];
      const exercises = exercisesRaw
        .filter(
          (ex): ex is Record<string, unknown> =>
            typeof ex === "object" && ex !== null
        )
        .map((ex) => ({
          id: randomUUID(),
          name: String(ex.name || "Exercise").slice(0, 80),
          sets: Number.isFinite(ex.sets)
            ? Math.max(1, Math.min(Number(ex.sets), 10))
            : 3,
          reps:
            typeof ex.reps === "number" && Number.isFinite(ex.reps)
              ? Number(ex.reps).toString()
              : typeof ex.reps === "string" && ex.reps.trim().length
                ? ex.reps.trim().slice(0, 40)
                : "8-12",
        }));
      return {
        day: String(item.day || "Mon").slice(0, 16),
        exercises,
      };
    })
    .filter((day) => day.exercises.length);
}

async function generateAiPlan(prefs: PlanPrefs): Promise<WorkoutDay[] | null> {
  if (!hasOpenAI()) {
    return null;
  }
  try {
    const { data } = await structuredJsonChat<AiPlanSchema>({
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userContent: buildPlanPrompt(prefs),
      temperature: 0.4,
      maxTokens: 800,
      timeoutMs: PLAN_TIMEOUT_MS,
      validate: validatePlanResponse,
    });
    const planDays = adaptAiPlanDays(data.days);
    return planDays.length ? planDays : null;
  } catch (err) {
    console.error("generateAiPlan", err);
    return null;
  }
}

async function resolvePlanDays(
  prefs: PlanPrefs
): Promise<{ days: WorkoutDay[]; source: string }> {
  const aiPlan = await generateAiPlan(prefs);
  if (aiPlan && aiPlan.length) {
    return { days: aiPlan, source: "openai" };
  }
  return { days: deterministicPlan(prefs), source: "deterministic" };
}

async function persistPlan(uid: string, prefs: PlanPrefs) {
  const { days, source } = await resolvePlanDays(prefs);
  const planId = randomUUID();
  const plan: WorkoutPlan = {
    id: planId,
    active: true,
    createdAt: Timestamp.now(),
    prefs,
    days,
  } as WorkoutPlan;
  await db.doc(`users/${uid}/workoutPlans/${planId}`).set(
    scrubUndefined({
      ...plan,
      source,
    })
  );
  await db.doc(`users/${uid}/workoutPlans_meta/current`).set(
    scrubUndefined({
      activePlanId: planId,
      updatedAt: Timestamp.now(),
    }),
    { merge: true }
  );
  return { planId, days, source };
}

async function fetchCurrentPlan(uid: string) {
  const meta = await db.doc(`users/${uid}/workoutPlans_meta/current`).get();
  const planId = (meta.data()?.activePlanId as string) || null;
  if (!planId) return null;
  const snap = await db.doc(`users/${uid}/workoutPlans/${planId}`).get();
  if (!snap.exists) return null;
  return { id: planId, ...(snap.data() as WorkoutPlan) };
}

async function handleGenerate(req: Request, res: Response) {
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "generateWorkoutPlan",
    uid,
  });
  const prefs = (req.body?.prefs || {}) as PlanPrefs;
  const plan = await persistPlan(uid, prefs);
  res.json(plan);
}

async function handleApplyCatalogPlan(req: Request, res: Response) {
  if (req.method !== "POST") {
    throw new HttpsError("invalid-argument", "Method not allowed.");
  }
  const { uid, claims } = await requireAuthWithClaims(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "applyCatalogPlan",
    uid,
  });

  await requireProgramsEntitlement(uid, claims);
  const plan = sanitizeCatalogPlan(req.body);
  const now = Timestamp.now();

  // Idempotency guard: if the user double-clicks "Start program" (or retries due to a transient network
  // error) we should not create multiple catalog plans. If the currently-active plan is already the same
  // catalog program and was created recently, just re-point meta and return it.
  try {
    const metaRef = db.doc(`users/${uid}/workoutPlans_meta/current`);
    const metaSnap = await metaRef.get();
    const activePlanId = (metaSnap.data()?.activePlanId as string) || "";
    if (activePlanId) {
      const activeSnap = await db.doc(`users/${uid}/workoutPlans/${activePlanId}`).get();
      if (activeSnap.exists) {
        const active = activeSnap.data() as any;
        const isCatalog = active?.source === "catalog";
        const sameProgram = active?.catalogProgramId === plan.programId;
        const createdAt = active?.createdAt as any;
        const createdMs =
          typeof createdAt?.toMillis === "function"
            ? Number(createdAt.toMillis())
            : createdAt instanceof Date
              ? createdAt.getTime()
              : typeof createdAt?.seconds === "number"
                ? createdAt.seconds * 1000
                : NaN;
        const isRecent = Number.isFinite(createdMs) && Date.now() - createdMs < 10 * 60 * 1000;
        if (isCatalog && sameProgram && isRecent) {
          await metaRef.set(
            scrubUndefined({
              activePlanId,
              updatedAt: now,
            }),
            { merge: true }
          );
          res.json({ planId: activePlanId, reused: true });
          return;
        }
      }
    }
  } catch (error: any) {
    // Never block plan activation on idempotency checks.
    console.warn("applyCatalogPlan.idempotency_check_failed", {
      uid,
      message: error?.message,
    });
  }

  const planId = randomUUID();
  await db.doc(`users/${uid}/workoutPlans/${planId}`).set(
    scrubUndefined({
      id: planId,
      active: true,
      createdAt: now,
      source: "catalog",
      catalogProgramId: plan.programId,
      title: plan.title,
      goal: plan.goal,
      level: plan.level,
      days: plan.days,
    })
  );
  await db.doc(`users/${uid}/workoutPlans_meta/current`).set(
    scrubUndefined({
      activePlanId: planId,
      updatedAt: now,
    }),
    { merge: true }
  );
  res.json({ planId });
}

async function handlePreviewCustomPlan(req: Request, res: Response) {
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "previewCustomPlan",
    uid,
  });
  const prefs = sanitizeCustomPrefs(req.body?.prefs ?? {});
  const title =
    typeof req.body?.title === "string" && req.body.title.trim().length
      ? req.body.title.trim().slice(0, 80)
      : buildCustomPlanTitle(prefs);
  const days = generateCustomPlanDays(prefs);
  res.json({ title, prefs, days });
}

async function handleApplyCustomPlan(req: Request, res: Response) {
  if (req.method !== "POST") {
    throw new HttpsError("invalid-argument", "Method not allowed.");
  }
  const { uid, claims } = await requireAuthWithClaims(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "applyCustomPlan",
    uid,
  });

  await requireProgramsEntitlement(uid, claims);

  const prefs = sanitizeCustomPrefs(req.body?.prefs ?? {});
  const title =
    typeof req.body?.title === "string" && req.body.title.trim().length
      ? req.body.title.trim().slice(0, 80)
      : buildCustomPlanTitle(prefs);
  const goal =
    typeof req.body?.goal === "string" && req.body.goal.trim().length
      ? req.body.goal.trim().slice(0, 40)
      : prefs.goal
        ? prefs.goal.replace(/_/g, " ")
        : undefined;
  const level =
    typeof req.body?.level === "string" && req.body.level.trim().length
      ? req.body.level.trim().slice(0, 40)
      : prefs.experience ?? undefined;

  // Reuse catalog sanitizer for days payload shape + strict weekday validation.
  const sanitized = sanitizeCatalogPlan({
    programId: `custom_${randomUUID().slice(0, 12)}`,
    title,
    goal,
    level,
    days: req.body?.days ?? [],
  });
  const now = Timestamp.now();
  const planId = randomUUID();
  await db.doc(`users/${uid}/workoutPlans/${planId}`).set(
    scrubUndefined({
      id: planId,
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: "custom",
      title: sanitized.title ?? title,
      goal: sanitized.goal ?? goal,
      level: sanitized.level ?? level,
      customPrefs: prefs as unknown as Record<string, unknown>,
      days: sanitized.days,
    } satisfies WorkoutPlan)
  );
  await db.doc(`users/${uid}/workoutPlans_meta/current`).set(
    scrubUndefined({
      activePlanId: planId,
      updatedAt: now,
    }),
    { merge: true }
  );
  res.json({ planId });
}

type UpdateWorkoutPlanOp =
  | {
      type: "update_exercise";
      dayIndex: number;
      exerciseIndex: number;
      name?: string;
      sets?: number;
      reps?: string | number;
    }
  | {
      type: "reorder_exercise";
      dayIndex: number;
      fromIndex: number;
      toIndex: number;
    }
  | {
      type: "move_exercise";
      fromDayIndex: number;
      fromIndex: number;
      toDayIndex: number;
      toIndex: number;
    }
  | {
      type: "set_day_name";
      dayIndex: number;
      day: string;
    };

function assertIndex(name: string, value: any, maxExclusive: number) {
  if (!Number.isFinite(value) || value < 0 || value >= maxExclusive) {
    throw new HttpsError("invalid-argument", `Invalid ${name}.`);
  }
}

function spliceMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

async function handleUpdateWorkoutPlan(req: Request, res: Response) {
  if (req.method !== "POST") {
    throw new HttpsError("invalid-argument", "Method not allowed.");
  }
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "updateWorkoutPlan",
    uid,
  });

  const planId =
    typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
  if (!planId) throw new HttpsError("invalid-argument", "Missing planId.");
  const op = (req.body?.op ?? null) as UpdateWorkoutPlanOp | null;
  if (!op || typeof op !== "object") {
    throw new HttpsError("invalid-argument", "Missing op.");
  }

  const planRef = db.doc(`users/${uid}/workoutPlans/${planId}`);
  const snap = await planRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Plan not found.");
  const plan = snap.data() as WorkoutPlan;
  const days = Array.isArray(plan.days) ? [...plan.days] : [];
  if (!days.length) throw new HttpsError("failed-precondition", "Plan is empty.");

  if (op.type === "update_exercise") {
    assertIndex("dayIndex", op.dayIndex, days.length);
    const day = days[op.dayIndex]!;
    const exercises = Array.isArray(day.exercises) ? [...day.exercises] : [];
    assertIndex("exerciseIndex", op.exerciseIndex, exercises.length);
    const ex = { ...(exercises[op.exerciseIndex] as any) };
    if (typeof op.name === "string" && op.name.trim().length) {
      ex.name = op.name.trim().slice(0, 80);
    }
    if (op.sets !== undefined) {
      const sets = clampInt(op.sets, 1, 10, ex.sets ?? 3);
      ex.sets = sets;
    }
    if (op.reps !== undefined) {
      const reps =
        typeof op.reps === "number" && Number.isFinite(op.reps)
          ? String(op.reps)
          : typeof op.reps === "string" && op.reps.trim().length
            ? op.reps.trim().slice(0, 40)
            : ex.reps ?? "10";
      ex.reps = reps;
    }
    exercises[op.exerciseIndex] = ex;
    days[op.dayIndex] = { ...day, exercises };
  } else if (op.type === "reorder_exercise") {
    assertIndex("dayIndex", op.dayIndex, days.length);
    const day = days[op.dayIndex]!;
    const exercises = Array.isArray(day.exercises) ? [...day.exercises] : [];
    assertIndex("fromIndex", op.fromIndex, exercises.length);
    assertIndex("toIndex", op.toIndex, exercises.length);
    days[op.dayIndex] = { ...day, exercises: spliceMove(exercises, op.fromIndex, op.toIndex) };
  } else if (op.type === "move_exercise") {
    assertIndex("fromDayIndex", op.fromDayIndex, days.length);
    assertIndex("toDayIndex", op.toDayIndex, days.length);
    const fromDay = days[op.fromDayIndex]!;
    const toDay = days[op.toDayIndex]!;
    const fromExercises = Array.isArray(fromDay.exercises) ? [...fromDay.exercises] : [];
    const toExercises = Array.isArray(toDay.exercises) ? [...toDay.exercises] : [];
    assertIndex("fromIndex", op.fromIndex, fromExercises.length);
    const insertAt = clampInt(op.toIndex, 0, Math.max(0, toExercises.length), toExercises.length);
    const [moved] = fromExercises.splice(op.fromIndex, 1);
    toExercises.splice(insertAt, 0, moved);
    days[op.fromDayIndex] = { ...fromDay, exercises: fromExercises };
    days[op.toDayIndex] = { ...toDay, exercises: toExercises };
  } else if (op.type === "set_day_name") {
    assertIndex("dayIndex", op.dayIndex, days.length);
    const dayName = typeof op.day === "string" ? op.day.trim() : "";
    if (!VALID_CATALOG_DAY_SET.has(dayName)) {
      throw new HttpsError("invalid-argument", "Invalid day.");
    }
    days[op.dayIndex] = { ...days[op.dayIndex]!, day: dayName };
  } else {
    throw new HttpsError("invalid-argument", "Unknown op type.");
  }

  const now = Timestamp.now();
  await planRef.set(
    scrubUndefined({
      days,
      updatedAt: now,
    }),
    { merge: true }
  );
  res.json({ ok: true });
}

async function handleSetWorkoutPlanStatus(req: Request, res: Response) {
  if (req.method !== "POST") {
    throw new HttpsError("invalid-argument", "Method not allowed.");
  }
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "setWorkoutPlanStatus",
    uid,
  });
  const planId =
    typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
  if (!planId) throw new HttpsError("invalid-argument", "Missing planId.");
  const statusRaw = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  const status =
    statusRaw === "paused" || statusRaw === "ended" ? statusRaw : null;
  if (!status) throw new HttpsError("invalid-argument", "Invalid status.");

  const now = Timestamp.now();
  const planRef = db.doc(`users/${uid}/workoutPlans/${planId}`);
  const metaRef = db.doc(`users/${uid}/workoutPlans_meta/current`);
  const [planSnap, metaSnap] = await Promise.all([planRef.get(), metaRef.get()]);
  if (!planSnap.exists) throw new HttpsError("not-found", "Plan not found.");
  const activePlanId = (metaSnap.data()?.activePlanId as string) || null;
  const isActive = activePlanId === planId;

  await Promise.all([
    planRef.set(
      scrubUndefined({
        active: false,
        status,
        pausedAt: status === "paused" ? now : null,
        endedAt: status === "ended" ? now : null,
        updatedAt: now,
      }),
      { merge: true }
    ),
    isActive
      ? metaRef.set(scrubUndefined({ activePlanId: null, updatedAt: now }), {
          merge: true,
        })
      : Promise.resolve(),
  ]);
  res.json({ ok: true });
}

async function handleGetPlan(req: Request, res: Response) {
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, { fn: "getPlan", uid });
  const plan = await fetchCurrentPlan(uid);
  res.json(plan);
}

async function handleMarkDone(req: Request, res: Response) {
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "markExerciseDone",
    uid,
  });
  const body = req.body as {
    planId?: string;
    dayIndex?: number;
    exerciseId?: string;
    done?: boolean;
  };
  if (
    !body.planId ||
    body.dayIndex === undefined ||
    !body.exerciseId ||
    typeof body.done !== "boolean"
  ) {
    throw new HttpsError("invalid-argument", "Invalid payload");
  }
  const planSnap = await db
    .doc(`users/${uid}/workoutPlans/${body.planId}`)
    .get();
  if (!planSnap.exists) {
    throw new HttpsError("not-found", "Plan not found");
  }
  const plan = planSnap.data() as WorkoutPlan;
  const day = plan.days?.[body.dayIndex];
  const total = day?.exercises?.length || 0;
  const iso = new Date().toISOString().slice(0, 10);
  const progressRef = db.doc(
    `users/${uid}/workoutPlans/${body.planId}/progress/${iso}`
  );
  let ratio = 0;
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(
      progressRef
    )) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const completed: string[] = snap.exists
      ? (snap.data()?.completed as string[]) || []
      : [];
    const idx = completed.indexOf(body.exerciseId!);
    if (body.done && idx < 0) {
      completed.push(body.exerciseId!);
    }
    if (!body.done && idx >= 0) {
      completed.splice(idx, 1);
    }
    ratio = total ? completed.length / total : 0;
    tx.set(
      progressRef,
      scrubUndefined({
        completed,
        updatedAt: Timestamp.now(),
      }),
      { merge: true }
    );
  });
  res.json({ ratio });
}

async function handleGetWorkouts(req: Request, res: Response) {
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, { fn: "getWorkouts", uid });
  const plan = await fetchCurrentPlan(uid);
  if (!plan) {
    res.json({ planId: null, days: [] });
    return;
  }
  const progressSnap = await db
    .collection(`users/${uid}/workoutPlans/${plan.id}/progress`)
    .orderBy("updatedAt", "desc")
    .limit(14)
    .get();
  const progress: Record<string, string[]> = {};
  progressSnap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = doc.data() as { completed?: string[] };
    progress[doc.id] = data.completed || [];
  });
  res.json({ planId: plan.id, days: plan.days, progress });
}

function withHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return onRequest(
    { invoker: "public" },
    withCors(async (req, res) => {
      try {
        await handler(req as unknown as Request, res as unknown as Response);
      } catch (err: any) {
        const code = errorCode(err);
        const status =
          code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
              ? 400
              : code === "not-found"
                ? 404
                : statusFromCode(code);
        res.status(status).json({ error: err.message || "error", code });
      }
    })
  );
}

/**
 * These HTTPS entrypoints back the client workouts/program flow:
 *  - Programs or Workouts pages call /generateWorkoutPlan to persist a plan in users/{uid}/workoutPlans.
 *  - /getPlan (and /getWorkouts) read the active plan + recent progress for dashboards.
 *  - /markExerciseDone toggles per-exercise completion for the active day.
 * The legacy names stay exported so existing callers that hit fnUrl("/getPlan") keep working.
 */
export const generateWorkoutPlan = withHandler(handleGenerate);
export const generatePlan = generateWorkoutPlan;
export const applyCatalogPlan = withHandler(handleApplyCatalogPlan);
export const previewCustomPlan = withHandler(handlePreviewCustomPlan);
export const applyCustomPlan = withHandler(handleApplyCustomPlan);
export const updateWorkoutPlan = withHandler(handleUpdateWorkoutPlan);
export const setWorkoutPlanStatus = withHandler(handleSetWorkoutPlanStatus);
export const getPlan = withHandler(handleGetPlan);
export const getCurrentPlan = getPlan;
export const markExerciseDone = withHandler(handleMarkDone);
export const addWorkoutLog = markExerciseDone;
export const getWorkouts = withHandler(handleGetWorkouts);

// Body-feel adjustment endpoint
export const adjustWorkout = onRequest(
  { invoker: "public", region: "us-central1" },
  withCors(async (req: ExpressRequest, res: ExpressResponse) => {
    const requestId = req.get("x-request-id")?.trim() || randomUUID();
    try {
      const uid = await requireAuth(req as any);
      await ensureSoftAppCheckFromRequest(req as any, {
        fn: "adjustWorkout",
        uid,
        requestId,
      });
      const payload = (req.body as any) || {};
      const dayId =
        typeof payload?.dayId === "string" ? payload.dayId.trim() : "";
      const normalizedBodyFeel = normalizeBodyFeel(payload?.bodyFeel);
      if (!uid || !dayId || !normalizedBodyFeel) {
        res.status(400).json({ error: "bad_request", debugId: requestId });
        return;
      }
      const notes = sanitizeNotes(payload?.notes);
      const plan = await fetchCurrentPlan(uid);
      const targetDay = plan?.days?.find((day) => day.day === dayId) ?? null;
      let mods = fallbackMods(normalizedBodyFeel);
      let summary: string | null = null;
      let source: "fallback" | "openai" = "fallback";
      if (hasOpenAI()) {
        try {
          const aiMods = await requestAiAdjustment({
            uid,
            requestId,
            bodyFeel: normalizedBodyFeel,
            notes,
            day: targetDay ?? null,
          });
          mods = { intensity: aiMods.intensity, volume: aiMods.volume };
          summary = aiMods.summary ?? null;
          source = "openai";
        } catch (error: any) {
          console.error("workout_adjust_ai_failed", {
            message: error?.message,
            requestId,
            uid,
          });
        }
      }
      res.json({
        ok: true,
        mods,
        summary,
        source,
        echo: { dayId, notes: notes ?? null, bodyFeel: normalizedBodyFeel },
        debugId: requestId,
      });
    } catch (error: any) {
      console.error("workout_adjust_failed", {
        message: error?.message,
        requestId,
      });
      if (!res.headersSent) {
        if (error instanceof HttpsError) {
          res.status(statusFromCode((error as HttpsError).code)).json({
            error: error.message,
            debugId: requestId,
          });
          return;
        }
        res.status(500).json({ error: "server_error", debugId: requestId });
      }
    }
  })
);
