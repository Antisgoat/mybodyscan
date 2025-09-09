import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";

export const expireCreditsDaily = onSchedule("every 24 hours", async () => {
  const db = getFirestore();
  const users = await db.collection("users").get();
  const now = Date.now();
  for (const u of users.docs) {
    const creditsDoc = await db.doc(`users/${u.id}/private/credits`).get();
    if (!creditsDoc.exists) continue;
    const data = creditsDoc.data() as any;
    let changed = false;
    const buckets = (data.creditBuckets || []).filter((b: any) => {
      if (!b.expiresAt) return true;
      const alive = b.expiresAt.toMillis() > now;
      if (!alive) changed = true;
      return alive;
    });
    if (changed) {
      const total = buckets.reduce(
        (s: number, b: any) => s + (b.amount || 0),
        0
      );
      await creditsDoc.ref.set(
        {
          creditBuckets: buckets,
          creditsSummary: { totalAvailable: total, lastUpdated: new Date() },
        },
        { merge: true }
      );
    }
  }
});
