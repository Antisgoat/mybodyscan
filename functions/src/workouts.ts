import { Timestamp } from "firebase-admin/firestore";
import { db, functions } from "./admin";
import { requireCallableAuth } from "./auth";
import * as crypto from "node:crypto";

interface WorkoutLogInput {
  date: string;
  exerciseId: string;
  sets: Array<{ reps: number; weight?: number; rir?: number }>;
}

export const addWorkoutLog = functions.https.onCall(async (data: WorkoutLogInput, context) => {
  const uid = requireCallableAuth(context, crypto.randomUUID());
  const { date, exerciseId, sets } = data || ({} as any);
  if (!date || !exerciseId || !Array.isArray(sets)) {
    throw new functions.https.HttpsError("invalid-argument", "date, exerciseId and sets required");
  }
  const ref = db.doc(`users/${uid}/workouts/${date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as any) : { entries: [] };
    const entries = Array.isArray(existing.entries) ? existing.entries : [];
    entries.push({
      id: crypto.randomUUID(),
      exerciseId,
      sets,
      loggedAt: Timestamp.now(),
    });
    tx.set(ref, { entries, updatedAt: Timestamp.now() }, { merge: true });
  });
  return { ok: true };
});

export const getWorkouts = functions.https.onCall(async (data: { date: string }, context) => {
  const uid = requireCallableAuth(context, crypto.randomUUID());
  const { date } = data || ({} as any);
  if (!date) {
    throw new functions.https.HttpsError("invalid-argument", "date required");
  }
  const snap = await db.doc(`users/${uid}/workouts/${date}`).get();
  if (!snap.exists) {
    return { entries: [] };
  }
  const doc = snap.data() as any;
  const entries = (doc.entries || []).map((entry: any) => ({ ...entry, loggedAt: entry.loggedAt?.toMillis?.() ?? null }));
  return { entries };
});

