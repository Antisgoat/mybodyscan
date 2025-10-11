import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

interface Prefs {
  focus?: "back" | "legs" | "core" | "full";
  equipment?: "none" | "dumbbells" | "bands" | "gym";
  daysPerWeek?: number;
  injuries?: string[];
}

async function requireUser(req: any): Promise<string> {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Unauthorized");
  const decoded = await getAuth().verifyIdToken(match[1]);
  return decoded.uid;
}

function buildTemplate(prefs: Prefs) {
  const focus = prefs.focus || "full";
  const base =
    focus === "back"
      ? [
          { id: randomUUID(), name: "Pull Ups", sets: 3, reps: 8 },
          { id: randomUUID(), name: "Rows", sets: 3, reps: 10 },
        ]
      : [
          { id: randomUUID(), name: "Squats", sets: 3, reps: 12 },
          { id: randomUUID(), name: "Plank", sets: 3, reps: 30 },
        ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const count = Math.min(prefs.daysPerWeek || 4, 7);
  return days.slice(0, count).map((d) => ({ day: d, exercises: base }));
}

/** Generate a simple workout plan based on preferences. */
export const generateWorkoutPlan = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const prefs = (req.body?.prefs || {}) as Prefs;
    const planId = randomUUID();
    const plan = {
      active: true,
      createdAt: Timestamp.now(),
      prefs,
      days: buildTemplate(prefs),
    };
    const db = getFirestore();
    await db.doc(`users/${uid}/workoutPlans/${planId}`).set(plan);
    await db.doc(`users/${uid}/workoutPlans_meta`).set({ activePlanId: planId });
    res.json({ planId, days: plan.days });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Get the active workout plan for the user. */
export const getPlan = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const db = getFirestore();
    const metaSnap = await db.doc(`users/${uid}/workoutPlans_meta`).get();
    const id = metaSnap.data()?.activePlanId as string | undefined;
    if (!id) {
      res.json(null);
      return;
    }
    const snap = await db.doc(`users/${uid}/workoutPlans/${id}`).get();
    res.json(snap.exists ? { id, ...snap.data() } : null);
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Mark an exercise as done/undone and return completion ratio. */
export const markExerciseDone = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const { planId, dayIndex, exerciseId, done } = req.body as {
      planId?: string;
      dayIndex?: number;
      exerciseId?: string;
      done?: boolean;
    };
    if (!planId || dayIndex === undefined || !exerciseId || typeof done !== "boolean") {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const db = getFirestore();
    const planSnap = await db.doc(`users/${uid}/workoutPlans/${planId}`).get();
    if (!planSnap.exists) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const plan = planSnap.data() as any;
    const total = plan.days?.[dayIndex]?.exercises?.length || 0;
    const today = new Date().toISOString().slice(0, 10);
    const progressRef = db.doc(`users/${uid}/workoutPlans/${planId}/progress/${today}`);
    let ratio = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);
      const completed: string[] = snap.exists ? (snap.data()?.completed as string[]) || [] : [];
      const idx = completed.indexOf(exerciseId);
      if (done && idx < 0) completed.push(exerciseId);
      if (!done && idx >= 0) completed.splice(idx, 1);
      ratio = total ? completed.length / total : 0;
      tx.set(progressRef, { completed }, { merge: true });
    });
    res.json({ ratio });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});
