import { Timestamp, getFirestore } from "./firebase";

const db = getFirestore();

interface CreditBucket {
  amount: number;
  grantedAt: Timestamp;
  expiresAt?: Timestamp | null;
  sourcePriceId?: string | null;
  context?: string | null;
}

export async function grantCredits(
  uid: string,
  amount: number,
  expiryDays: number,
  sourcePriceId: string,
  context: string
) {
  const userRef = db.doc(`users/${uid}/private/credits`);
  const now = Timestamp.now();
  const expiresAt = expiryDays > 0 ? Timestamp.fromMillis(now.toMillis() + expiryDays * 86400000) : null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() as any) : {};
    const buckets: CreditBucket[] = Array.isArray(data.creditBuckets)
      ? data.creditBuckets.map((b: any) => ({
          amount: Number(b.amount || 0),
          grantedAt: b.grantedAt || now,
          expiresAt: b.expiresAt || null,
          sourcePriceId: b.sourcePriceId || null,
          context: b.context || null,
        }))
      : [];
    buckets.push({
      amount,
      grantedAt: now,
      expiresAt,
      sourcePriceId,
      context,
    });
    const total = buckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
    tx.set(
      userRef,
      {
        creditBuckets: buckets,
        creditsSummary: {
          totalAvailable: total,
          lastUpdated: now,
        },
      },
      { merge: true }
    );
  });
}

export async function consumeCredit(uid: string): Promise<boolean> {
  const userRef = db.doc(`users/${uid}/private/credits`);
  let consumed = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const data = snap.data() as any;
    const now = Timestamp.now();
    const buckets: any[] = Array.isArray(data.creditBuckets) ? [...data.creditBuckets] : [];
    buckets.sort((a, b) => {
      const aTime = a.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    for (const bucket of buckets) {
      const expiresAt = bucket.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      if (expiresAt <= now.toMillis()) continue;
      if ((bucket.amount || 0) > 0) {
        bucket.amount = (bucket.amount || 0) - 1;
        consumed = true;
        break;
      }
    }
    const total = buckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
    tx.set(
      userRef,
      {
        creditBuckets: buckets,
        creditsSummary: { totalAvailable: total, lastUpdated: now },
      },
      { merge: true }
    );
  });
  return consumed;
}

export async function refreshCreditsSummary(uid: string) {
  const userRef = db.doc(`users/${uid}/private/credits`);
  const snap = await userRef.get();
  if (!snap.exists) return;
  const data = snap.data() as any;
  const buckets: any[] = Array.isArray(data.creditBuckets) ? data.creditBuckets : [];
  const now = Timestamp.now();
  const filtered = buckets.filter((bucket) => {
    const expiresAt = bucket.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return expiresAt > now.toMillis();
  });
  const total = filtered.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
  await userRef.set(
    {
      creditBuckets: filtered,
      creditsSummary: {
        totalAvailable: total,
        lastUpdated: now,
      },
    },
    { merge: true }
  );
}

export async function setSubscriptionStatus(
  uid: string,
  status: "active" | "canceled" | "none",
  priceId: string | null,
  renewalUnix: number | null
) {
  await db.doc(`users/${uid}`).set(
    {
      subscription: {
        status,
        planPriceId: priceId,
        renewalDate: renewalUnix ? new Date(renewalUnix * 1000) : null,
      },
    },
    { merge: true }
  );
}
