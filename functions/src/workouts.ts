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
import { requireAuth } from "./http.js";
import type { WorkoutDay, WorkoutPlan } from "./types.js";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { ensureSoftAppCheckFromRequest } from "./lib/appCheckSoft.js";
import { hasOpenAI } from "./lib/env.js";
import { scrubUndefined } from "./lib/scrub.js";
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
  const uid = await requireAuth(req);
  await ensureSoftAppCheckFromRequest(req as any, {
    fn: "applyCatalogPlan",
    uid,
  });
  const plan = sanitizeCatalogPlan(req.body);
  const planId = randomUUID();
  const now = Timestamp.now();
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
        res.status(status).json({ error: err.message || "error" });
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
