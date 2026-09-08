import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";

const db = getFirestore();

export function monthlyQuotaDocumentPath(
  uid: string,
  key: string,
  date = new Date()
): string {
  const safeKey = String(key || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!uid || uid.includes("/") || !safeKey) {
    throw new HttpsError("internal", "monthly_quota_key_invalid");
  }
  const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `users/${uid}/private/monthlyQuota_${safeKey}_${period}`;
}

export async function enforceMonthlyQuota(config: {
  uid: string;
  key: string;
  limit: number;
}): Promise<{ remaining: number }> {
  const limit = Math.max(1, Math.trunc(config.limit));
  const ref = db.doc(monthlyQuotaDocumentPath(config.uid, config.key));
  const now = Timestamp.now();

  return db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(
      ref
    )) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const current = snap.exists ? Number(snap.data()?.count) || 0 : 0;
    if (current >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        "Monthly fair-use allowance reached. Contact support if you need help."
      );
    }
    const next = current + 1;
    tx.set(
      ref,
      {
        count: next,
        limit,
        updatedAt: now,
        firstUsedAt: snap.exists
          ? snap.data()?.firstUsedAt || now
          : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { remaining: Math.max(0, limit - next) };
  });
}
