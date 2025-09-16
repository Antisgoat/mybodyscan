import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";

interface CreditBucket {
  amount: number;
  grantedAt: Timestamp;
  expiresAt: Timestamp;
  sourcePriceId?: string | null;
  context?: string;
}

interface CreditsDocument {
  creditBuckets: CreditBucket[];
  creditsSummary: {
    totalAvailable: number;
    lastUpdated: Timestamp;
  };
}

function creditsRef(uid: string) {
  return db.doc(`users/${uid}/private/credits`);
}

export async function grantCredits(
  uid: string,
  amount: number,
  expiryDays: number,
  sourcePriceId: string | null,
  context: string
) {
  if (amount <= 0) return;
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + expiryDays * 24 * 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    const ref = creditsRef(uid);
    const snap = await tx.get(ref);
    const data = (snap.exists ? (snap.data() as CreditsDocument) : null) || {
      creditBuckets: [],
      creditsSummary: { totalAvailable: 0, lastUpdated: now },
    };
    const existing = data.creditBuckets.find((bucket) => bucket.context === context);
    if (existing) {
      return;
    }
    data.creditBuckets.push({ amount, grantedAt: now, expiresAt, sourcePriceId, context });
    const total = data.creditBuckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
    data.creditsSummary = { totalAvailable: total, lastUpdated: now };
    tx.set(ref, data, { merge: true });
  });
}

export async function refreshCreditsSummary(uid: string) {
  const ref = creditsRef(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as CreditsDocument;
  const now = Timestamp.now();
  const validBuckets = (data.creditBuckets || []).filter((bucket) => bucket.expiresAt.toMillis() > now.toMillis());
  const total = validBuckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
  await ref.set(
    {
      creditBuckets: validBuckets,
      creditsSummary: { totalAvailable: total, lastUpdated: now },
    },
    { merge: true }
  );
}

export async function consumeCredit(uid: string): Promise<number | null> {
  const ref = creditsRef(uid);
  let remaining: number | null = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      remaining = null;
      return;
    }
    const now = Timestamp.now();
    const data = snap.data() as CreditsDocument;
    const validBuckets = data.creditBuckets
      .filter((bucket) => bucket.expiresAt.toMillis() > now.toMillis())
      .sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis());
    let consumed = false;
    for (const bucket of validBuckets) {
      if (bucket.amount > 0) {
        bucket.amount -= 1;
        consumed = true;
        break;
      }
    }
    if (!consumed) {
      remaining = null;
      return;
    }
    const total = validBuckets.reduce((sum, bucket) => sum + Math.max(bucket.amount, 0), 0);
    remaining = total;
    tx.set(
      ref,
      {
        creditBuckets: validBuckets,
        creditsSummary: { totalAvailable: total, lastUpdated: now },
      },
      { merge: true }
    );
  });
  return remaining;
}

export async function getCurrentCredits(uid: string): Promise<number> {
  const snap = await creditsRef(uid).get();
  return (snap.data()?.creditsSummary?.totalAvailable as number | undefined) ?? 0;
}
