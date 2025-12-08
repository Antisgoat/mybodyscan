import { randomUUID } from "crypto";
import OpenAI from "openai";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "./firebase.js";
import { errorCode, statusFromCode } from "./lib/errors.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth } from "./http.js";
import type { WorkoutDay, WorkoutPlan } from "./types.js";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { ensureSoftAppCheckFromRequest } from "./lib/appCheckSoft.js";
import { hasOpenAI } from "./lib/env.js";
import { getOpenAIKey } from "./openai/keys.js";

const db = getFirestore();
type BodyFeel = "great" | "ok" | "tired" | "sore";
const BODY_FEEL_VALUES: BodyFeel[] = ["great", "ok", "tired", "sore"];
const BODY_FEEL_SET = new Set<BodyFeel>(BODY_FEEL_VALUES);
const ADJUST_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ADJUST_TIMEOUT_MS = 8_000;
const MAX_NOTE_LENGTH = 400;

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
    exercises: baseExercises.map((ex, idx) => ({ ...ex, id: `${ex.id}-${index}-${idx}` })),
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
    const name = typeof exercise?.name === "string" && exercise.name.trim().length ? exercise.name : `Movement ${index + 1}`;
    const sets = typeof exercise?.sets === "number" ? exercise.sets : "-";
    const reps = typeof exercise?.reps === "string" || typeof exercise?.reps === "number" ? exercise.reps : "-";
    return `${index + 1}. ${name} – ${sets} x ${reps}`;
  });
  return `Day ${day.day}: ${items.join("; ")}`;
}

function extractAdjustmentJson(content: string): any {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```json([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/i);
  if (fenced) {
    const payload = fenced[1]?.trim();
    if (payload) {
      return JSON.parse(payload);
    }
  }
  return JSON.parse(trimmed);
}

function parseAdjustmentPayload(raw: any): AdjustmentMods {
  const intensity = clampDelta(Number(raw?.intensity ?? raw?.intensityDelta ?? raw?.intensity_delta ?? raw?.intensityAdjustment));
  const volume = clampDelta(Number(raw?.volume ?? raw?.volumeDelta ?? raw?.volume_delta ?? raw?.volumeAdjustment));
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

function normalizeBodyFeel(value: unknown): BodyFeel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return BODY_FEEL_SET.has(normalized as BodyFeel) ? (normalized as BodyFeel) : null;
}

function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function fallbackMods(bodyFeel: BodyFeel): { intensity: number; volume: number } {
  return {
    intensity: bodyFeel === "great" ? 1 : bodyFeel === "tired" || bodyFeel === "sore" ? -1 : 0,
    volume: bodyFeel === "great" ? 1 : bodyFeel === "sore" ? -1 : 0,
  };
}

async function requestAiAdjustment(input: {
  uid: string;
  requestId: string;
  bodyFeel: BodyFeel;
  notes: string | null;
  day: WorkoutDay | null;
}): Promise<AdjustmentMods> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("openai_missing_key");
  }

  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADJUST_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create({
      model: ADJUST_MODEL,
      temperature: 0.2,
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content:
            "You fine-tune strength training plans. Respond with compact JSON shaped as {\"intensity\":-2..2,\"volume\":-2..2,\"summary\":\"<=160 chars\"}. Positive numbers increase stress, negative ease up.",
        },
        {
          role: "user",
          content: [
            `Body feel: ${input.bodyFeel}`,
            `Notes: ${input.notes ?? "none provided"}`,
            describeDay(input.day),
            "Respond with JSON only.",
          ].join("\n"),
        },
      ],
      user: input.uid,
      signal: controller.signal as any,
    } as any);

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("openai_empty_response");
    }
    const raw = extractAdjustmentJson(content);
    return parseAdjustmentPayload(raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAiPlan(prefs: PlanPrefs): Promise<WorkoutDay[] | null> {
  const { getOpenAIKey, getEnv } = await import("./lib/env.js");
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;
  try {
    const prompt = `Return a JSON array of workout days. Each item must include "day" (Mon-Sun) and an array "exercises" with {"name","sets","reps"}. Focus: ${
      prefs.focus || "balanced"
    }. Equipment: ${prefs.equipment || "bodyweight"}. Days per week: ${prefs.daysPerWeek || 4}.`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getEnv("OPENAI_MODEL") || "gpt-4o-mini",
        input: prompt,
        temperature: 0.4,
      }),
    });
    if (!response.ok) {
      throw new Error(`openai ${response.status}`);
    }
    const data = (await response.json()) as any;
    const text: string =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      data?.choices?.[0]?.message?.content ||
      "";
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      throw new Error("invalid ai response");
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) throw new Error("invalid plan");
    return parsed
      .filter((item) => typeof item === "object" && item !== null)
      .map((item) => ({
        day: String(item.day || "Mon"),
        exercises: Array.isArray(item.exercises)
          ? item.exercises.map((ex: any) => ({
              id: randomUUID(),
              name: String(ex.name || "Exercise"),
              sets: Number(ex.sets || 3),
              reps: Number(ex.reps || 10),
            }))
          : [],
      }));
  } catch (err) {
    console.error("generateAiPlan", err);
    return null;
  }
}

async function resolvePlanDays(prefs: PlanPrefs): Promise<{ days: WorkoutDay[]; source: string }> {
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
  await db.doc(`users/${uid}/workoutPlans/${planId}`).set({
    ...plan,
    source,
  });
  await db.doc(`users/${uid}/workoutPlans_meta`).set(
    {
      activePlanId: planId,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return { planId, days, source };
}

async function fetchCurrentPlan(uid: string) {
  const meta = await db.doc(`users/${uid}/workoutPlans_meta`).get();
  const planId = (meta.data()?.activePlanId as string) || null;
  if (!planId) return null;
  const snap = await db.doc(`users/${uid}/workoutPlans/${planId}`).get();
  if (!snap.exists) return null;
  return { id: planId, ...(snap.data() as WorkoutPlan) };
}

async function handleGenerate(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const prefs = (req.body?.prefs || {}) as PlanPrefs;
  const plan = await persistPlan(uid, prefs);
  res.json(plan);
}

async function handleGetPlan(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const plan = await fetchCurrentPlan(uid);
  res.json(plan);
}

async function handleMarkDone(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const body = req.body as {
    planId?: string;
    dayIndex?: number;
    exerciseId?: string;
    done?: boolean;
  };
  if (!body.planId || body.dayIndex === undefined || !body.exerciseId || typeof body.done !== "boolean") {
    throw new HttpsError("invalid-argument", "Invalid payload");
  }
  const planSnap = await db.doc(`users/${uid}/workoutPlans/${body.planId}`).get();
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
    const snap = (await tx.get(progressRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const completed: string[] = snap.exists ? (snap.data()?.completed as string[]) || [] : [];
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
      {
        completed,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
  res.json({ ratio });
}

async function handleGetWorkouts(req: Request, res: Response) {
  const uid = await requireAuth(req);
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

export const generateWorkoutPlan = withHandler(handleGenerate);
export const generatePlan = generateWorkoutPlan;
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
      await ensureSoftAppCheckFromRequest(req as any, { fn: "adjustWorkout", uid, requestId });
      const payload = (req.body as any) || {};
      const dayId = typeof payload?.dayId === "string" ? payload.dayId.trim() : "";
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
      console.error("workout_adjust_failed", { message: error?.message, requestId });
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

