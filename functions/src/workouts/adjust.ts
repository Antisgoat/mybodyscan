import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "../firebase.js";
import { withCors } from "../middleware/cors.js";
import { appCheckSoft } from "../middleware/appCheck.js";
import { requireAuth } from "../http.js";
import type { WorkoutDay, WorkoutExercise, WorkoutPlan } from "../types.js";

const db = getFirestore();

const OPTIONS = { region: "us-central1", invoker: "public", concurrency: 10 } as const;

type BodyFeelLevel = "ready" | "steady" | "tired" | "sore" | "burned";

interface AdjustmentProfile {
  volumeMultiplier: number;
  repMultiplier: number;
  intensity: "push" | "maintain" | "deload" | "recover";
  headline: string;
  cues: string[];
}

const PROFILES: Record<BodyFeelLevel, AdjustmentProfile> = {
  ready: {
    volumeMultiplier: 1.15,
    repMultiplier: 1.1,
    intensity: "push",
    headline: "Crush it — lean in with an extra set and crisp tempo.",
    cues: ["Add one back-off set", "Nail full range, controlled negatives"],
  },
  steady: {
    volumeMultiplier: 1,
    repMultiplier: 1,
    intensity: "maintain",
    headline: "Steady work — stay consistent and focus on form.",
    cues: ["Keep rest to 90s", "Lock in bracing and breathing"],
  },
  tired: {
    volumeMultiplier: 0.85,
    repMultiplier: 0.9,
    intensity: "deload",
    headline: "Dial it back — quality reps over quantity today.",
    cues: ["Trim one set", "Use RPE 7 caps"],
  },
  sore: {
    volumeMultiplier: 0.75,
    repMultiplier: 0.85,
    intensity: "deload",
    headline: "Recovery focus — lighter volume with perfect technique.",
    cues: ["Lengthen warm-up", "Swap heavy moves for mobility if needed"],
  },
  burned: {
    volumeMultiplier: 0.6,
    repMultiplier: 0.75,
    intensity: "recover",
    headline: "Prioritise recovery — strip volume and slow tempo.",
    cues: ["Stop 3 reps shy of failure", "Add extra mobility or walk"],
  },
};

function normalizeBodyFeel(value: unknown): BodyFeelLevel {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (["great", "fresh", "crushed", "pumped", "ready"].includes(trimmed)) return "ready";
    if (["good", "ok", "steady", "fine", "normal"].includes(trimmed)) return "steady";
    if (["tired", "stiff", "groggy", "sleepy"].includes(trimmed)) return "tired";
    if (["sore", "tight", "achy"].includes(trimmed)) return "sore";
    if (["burned", "burnt", "injured", "pain", "overdid", "wrecked"].includes(trimmed)) return "burned";
  }
  return "steady";
}

function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

async function ensureSoftAppCheck(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve) => {
    appCheckSoft(req, res, () => resolve());
  });
}

async function loadActivePlan(uid: string): Promise<(WorkoutPlan & { id: string }) | null> {
  const metaSnap = await db.doc(`users/${uid}/workoutPlans_meta`).get();
  const planId = (metaSnap.data()?.activePlanId as string) || null;
  if (!planId) {
    return null;
  }
  const planSnap = await db.doc(`users/${uid}/workoutPlans/${planId}`).get();
  if (!planSnap.exists) {
    return null;
  }
  return { id: planId, ...(planSnap.data() as WorkoutPlan) };
}

function applyProfile(day: WorkoutDay, profile: AdjustmentProfile) {
  const adjustments = day.exercises.map((exercise: WorkoutExercise) => {
    const targetSets = Math.max(1, Math.round(exercise.sets * profile.volumeMultiplier));
    const targetReps = Math.max(1, Math.round(exercise.reps * profile.repMultiplier));
    const note = profile.intensity === "push"
      ? "Add one back-off set at lighter load"
      : profile.intensity === "recover"
      ? "Stop early if form slips"
      : "Maintain smooth tempo";
    return {
      id: exercise.id,
      name: exercise.name,
      sets: targetSets,
      reps: targetReps,
      cue: note,
    };
  });
  return adjustments;
}

export const workoutsAdjust = onRequest(
  OPTIONS,
  withCors(async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    await ensureSoftAppCheck(req, res);

    let uid: string;
    try {
      uid = await requireAuth(req);
    } catch (error: any) {
      const code = error?.code as string | undefined;
      const status = code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : 401;
      res.status(status).json({ error: error?.message || "unauthenticated" });
      return;
    }

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const dayIdRaw = typeof body.dayId === "string" ? body.dayId.trim() : "";
    if (!dayIdRaw) {
      res.status(400).json({ error: "invalid_day" });
      return;
    }

    const profile = PROFILES[normalizeBodyFeel(body.bodyFeel)];
    const notes = sanitizeNotes(body.notes);

    const plan = await loadActivePlan(uid);
    if (!plan) {
      res.status(404).json({ error: "plan_not_found" });
      return;
    }

    const day = plan.days?.find((entry) => entry.day === dayIdRaw);
    if (!day) {
      res.status(404).json({ error: "day_not_found" });
      return;
    }

    const adjustments = applyProfile(day, profile);

    const mods = {
      intensity: profile.intensity,
      volumeMultiplier: profile.volumeMultiplier,
      headline: profile.headline,
      cues: profile.cues,
      adjustments,
    };

    const entryId = `${dayIdRaw}-${Date.now()}`;
    await db
      .doc(`users/${uid}/workoutPlans/${plan.id}/adjustments/${entryId}`)
      .set({
        createdAt: Timestamp.now(),
        dayId: dayIdRaw,
        bodyFeel: normalizeBodyFeel(body.bodyFeel),
        notes: notes ?? null,
        mods,
      });

    res.json({ mods, recorded: true, planId: plan.id, dayId: dayIdRaw });
  }),
);

