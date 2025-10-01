import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";

const db = getFirestore();

interface RateLimitConfig {
  uid: string;
  key: string;
  limit: number;
  windowMs: number;
}

export async function enforceRateLimit(config: RateLimitConfig): Promise<void> {
  const { uid, key, limit, windowMs } = config;
  const ref = db.doc(`users/${uid}/private/rateLimits/${key}`);
  const now = Timestamp.now();
  const windowStart = now.toMillis() - windowMs;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as any) : {};
      const events: Timestamp[] = Array.isArray(data.events)
        ? data.events.filter((item): item is Timestamp => item instanceof Timestamp)
        : [];
      const recent = events.filter((event) => event.toMillis() >= windowStart);
      if (recent.length >= limit) {
        console.warn("rate_limit_triggered", { uid, key, limit, windowMs });
        throw new HttpsError("resource-exhausted", "rate_limited");
      }
      recent.push(now);
      tx.set(
        ref,
        {
          events: recent,
          limit,
          windowMs,
          updatedAt: now,
          count: FieldValue.increment(1),
        },
        { merge: true }
      );
    });
  } catch (err) {
    if (err instanceof HttpsError) {
      throw err;
    }
    console.error("rate_limit_error", { uid, key, message: (err as any)?.message });
    throw new HttpsError("internal", "rate_limit_store_error");
  }
}
