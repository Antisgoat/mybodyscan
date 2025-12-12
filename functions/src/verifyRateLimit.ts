import type { Transaction } from "firebase-admin/firestore";
import { FieldValue, getFirestore } from "./firebase.js";

type VerifyRateLimitOptions = {
  key: string;
  max: number;
  windowSeconds: number;
};

export async function verifyRateLimit(
  req: any,
  opts: VerifyRateLimitOptions
): Promise<void> {
  const uid = (req as any)?.auth?.uid || (req as any)?.user?.uid || "";
  const ip = (
    req?.headers?.["x-forwarded-for"] ||
    req?.socket?.remoteAddress ||
    ""
  )
    .toString()
    .split(",")[0]
    .trim();
  const id = uid || ip || "anon";
  const key = `${opts.key}:${id}`;
  const now = Date.now();

  const db = getFirestore();
  const ref = db.collection("ratelimits").doc(key);

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as Record<string, unknown>) || {}
      : {};
    const windowStart =
      typeof data.windowStart === "number" ? data.windowStart : now;
    const count = typeof data.count === "number" ? data.count : 0;
    const elapsed = now - windowStart;

    if (elapsed > opts.windowSeconds * 1000) {
      tx.set(ref, {
        count: 1,
        windowStart: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const next = count + 1;
    tx.set(
      ref,
      { count: next, windowStart, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    if (next > opts.max) {
      const error: any = new Error("Too Many Requests");
      error.status = 429;
      throw error;
    }
  });
}
