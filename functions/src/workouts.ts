import { randomUUID } from "crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "./firebase.js";
import { errorCode, statusFromCode } from "./lib/errors.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth, verifyAppCheckStrict } from "./http.js";
import type { WorkoutDay, WorkoutPlan } from "./types.js";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

const db = getFirestore();

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

async function generateAiPlan(prefs: PlanPrefs): Promise<WorkoutDay[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
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
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: prompt,
        temperature: 0.4,
      }),
    });
    if (!response.ok) {
      throw new Error(`openai ${response.status}`);
    }
    const data = await response.json();
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
  await verifyAppCheckStrict(req as any);
  const uid = await requireAuth(req);
  const prefs = (req.body?.prefs || {}) as PlanPrefs;
  const plan = await persistPlan(uid, prefs);
  res.json(plan);
}

async function handleGetPlan(req: Request, res: Response) {
  await verifyAppCheckStrict(req as any);
  const uid = await requireAuth(req);
  const plan = await fetchCurrentPlan(uid);
  res.json(plan);
}

async function handleMarkDone(req: Request, res: Response) {
  await verifyAppCheckStrict(req as any);
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
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(progressRef);
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
  await verifyAppCheckStrict(req as any);
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
  progressSnap.docs.forEach((doc) => {
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
        await verifyAppCheckStrict(req as any);
        await handler(req as unknown as Request, res as unknown as Response);
    } catch (err: any) {
      const code = errorCode(err);
      const status = code === "not-found" ? 404 : code === "invalid-argument" ? 400 : code === "unauthenticated" ? 401 : statusFromCode(code);
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
    try {
      await verifyAppCheckStrict(req as any);
      const uid = await requireAuth(req as any);
      const { dayId, bodyFeel, notes } = (req.body as any) || {};
      if (!uid || !dayId || !bodyFeel) {
        res.status(400).json({ error: "bad_request" });
        return;
      }
      const mods = {
        intensity: bodyFeel === "great" ? +1 : bodyFeel === "tired" || bodyFeel === "sore" ? -1 : 0,
        volume: bodyFeel === "great" ? +1 : bodyFeel === "sore" ? -1 : 0,
      };
      res.json({ ok: true, mods, echo: { dayId, notes: notes || null } });
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "server_error" });
      }
    }
  })
);
