import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";

const db = getFirestore();

interface RateLimitConfig {
  uid: string;
  key: string;
  limit: number;
  windowMs: number;
}

export function rateLimitDocumentPath(uid: string, key: string): string {
  const safeKey = String(key || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!uid || uid.includes("/") || !safeKey) {
    throw new HttpsError("internal", "rate_limit_key_invalid");
  }
  // Firestore document paths must have an even number of segments. Keep rate
  // limit state in a server-only document under the existing `private`
  // collection instead of the invalid `private/rateLimits/{key}` shape.
  return `users/${uid}/private/rateLimits_${safeKey}`;
}

export async function enforceRateLimit(config: RateLimitConfig): Promise<void> {
  const { uid, key, limit, windowMs } = config;
  const ref = db.doc(rateLimitDocumentPath(uid, key));
  const now = Timestamp.now();
  const windowStart = now.toMillis() - windowMs;

  try {
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(
        ref
      )) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      const data = snap.exists ? (snap.data() as any) : {};
      const events: Timestamp[] = Array.isArray(data.events)
        ? data.events.filter(
            (item: unknown): item is Timestamp => item instanceof Timestamp
          )
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
    console.error("rate_limit_error", {
      uid,
      key,
      message: (err as any)?.message,
    });
    throw new HttpsError("internal", "rate_limit_store_error");
  }
}
