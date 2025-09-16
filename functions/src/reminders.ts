import { Timestamp } from "firebase-admin/firestore";
import { db, functions } from "./admin";
import { requireCallableAuth } from "./auth";
import * as crypto from "node:crypto";

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const getReminders = functions.https.onCall(async (_, context) => {
  const uid = requireCallableAuth(context, crypto.randomUUID());
  const now = new Date();
  const scansSnap = await db
    .collection(`users/${uid}/scans`)
    .orderBy("completedAt", "desc")
    .limit(1)
    .get();
  let scanDue = true;
  if (!scansSnap.empty) {
    const completedAt = scansSnap.docs[0].data().completedAt as Timestamp | undefined;
    if (completedAt) {
      const diffDays = (Date.now() - completedAt.toMillis()) / (1000 * 60 * 60 * 24);
      scanDue = diffDays >= 30;
    }
  }

  const checkinSnap = await db
    .collection(`users/${uid}/coach/checkins`)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  let checkinDue = true;
  if (!checkinSnap.empty) {
    const createdAt = checkinSnap.docs[0].data().createdAt as Timestamp | undefined;
    if (createdAt) {
      const diffDays = (Date.now() - createdAt.toMillis()) / (1000 * 60 * 60 * 24);
      checkinDue = diffDays >= 7;
    }
  }

  let workoutsToday = false;
  const metaSnap = await db.doc(`users/${uid}/coach/plan/meta`).get();
  if (metaSnap.exists) {
    const meta = metaSnap.data() as any;
    const startDate: Timestamp | undefined = meta.startDate;
    if (startDate) {
      const start = startOfDay(startDate.toDate());
      const todayStart = startOfDay(now);
      const diffDays = Math.floor((todayStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), meta.lengthWeeks || 1);
      const dayOfWeek = todayStart.getDay();
      const weekDoc = await db.doc(`users/${uid}/coach/plan/week${weekNumber}`).get();
      if (weekDoc.exists) {
        const weekData = weekDoc.data() as any;
        const plannedDay = (weekData.days || []).find((day: any) => day.dayOfWeek === dayOfWeek);
        if (plannedDay) {
          const dateKey = todayStart.toISOString().slice(0, 10);
          const workoutDoc = await db.doc(`users/${uid}/workouts/${dateKey}`).get();
          workoutsToday = !workoutDoc.exists || (workoutDoc.data()?.entries || []).length === 0;
        }
      }
    }
  }

  return { scanDue, checkinDue, workoutsToday };
});
