import { FieldValue, Timestamp, getFirestore } from "./firebase.js";

const db = getFirestore();
const MAX_TRANSACTION_ATTEMPTS = 5;

interface CreditBucket {
  amount: number;
  grantedAt: Timestamp;
  expiresAt: Timestamp | null;
  sourcePriceId: string | null;
  context: string | null;
}

interface ConsumeResult {
  consumed: boolean;
  remaining: number;
  logEmpty?: boolean;
}

function getSummaryRef(uid: string) {
  return db.doc(`users/${uid}/private/credits`);
}

function addMonths(base: Date, months: number): Date {
  const copy = new Date(base.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function sanitizeBucket(raw: any, now: Timestamp): CreditBucket | null {
  const amount = Math.max(0, Math.floor(Number(raw?.amount ?? 0)));
  if (!amount) return null;
  const grantedAt = raw?.grantedAt instanceof Timestamp ? raw.grantedAt : now;
  const expiresAt = raw?.expiresAt instanceof Timestamp ? raw.expiresAt : null;
  if (expiresAt && expiresAt.toMillis() <= now.toMillis()) {
    return null;
  }
  return {
    amount,
    grantedAt,
    expiresAt,
    sourcePriceId:
      typeof raw?.sourcePriceId === "string" ? raw.sourcePriceId : null,
    context: typeof raw?.context === "string" ? raw.context : null,
  };
}

function normalizeBuckets(data: any, now: Timestamp): CreditBucket[] {
  const rawBuckets = Array.isArray(data?.creditBuckets)
    ? data.creditBuckets
    : [];
  const buckets = rawBuckets
    .map((bucket: unknown): CreditBucket | null => sanitizeBucket(bucket, now))
    .filter(
      (bucket: CreditBucket | null): bucket is CreditBucket => bucket !== null
    );
  buckets.sort((a: CreditBucket, b: CreditBucket) => {
    const aExpires = a.expiresAt
      ? a.expiresAt.toMillis()
      : Number.MAX_SAFE_INTEGER;
    const bExpires = b.expiresAt
      ? b.expiresAt.toMillis()
      : Number.MAX_SAFE_INTEGER;
    if (aExpires !== bExpires) {
      return aExpires - bExpires;
    }
    return a.grantedAt.toMillis() - b.grantedAt.toMillis();
  });
  return buckets;
}

function computeTotal(buckets: CreditBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
}

async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mutateBuckets(
  uid: string,
  mutator: (buckets: CreditBucket[], now: Timestamp) => ConsumeResult
): Promise<ConsumeResult> {
  return runWithRetry(async () => {
    const ref = getSummaryRef(uid);
    return db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(
        ref
      )) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      const now = Timestamp.now();
      const buckets = snap.exists ? normalizeBuckets(snap.data(), now) : [];
      const beforeTotal = computeTotal(buckets);
      const result = mutator(buckets, now);
      const afterBuckets = buckets.filter((bucket) => bucket.amount > 0);
      const total = computeTotal(afterBuckets);

      tx.set(
        ref,
        {
          creditBuckets: afterBuckets,
          creditsSummary: {
            totalAvailable: total,
            lastUpdated: now,
            version: FieldValue.increment(1),
          },
          creditVersion: FieldValue.increment(1),
        },
        { merge: true }
      );

      if (!result.consumed && beforeTotal === 0 && result.logEmpty !== false) {
        console.warn("credits_empty", { uid });
      }
      if (result.consumed) {
        console.info("credits_consumed", { uid, remaining: total });
        if (total <= 1) {
          console.warn("credits_low_balance", { uid, remaining: total });
        }
      }

      return { consumed: result.consumed, remaining: total };
    });
  });
}

export async function refreshCreditsSummary(uid: string): Promise<void> {
  await mutateBuckets(uid, (buckets) => ({
    consumed: false,
    remaining: computeTotal(buckets),
    logEmpty: false,
  }));
}

export async function addCredits(
  uid: string,
  amount: number,
  reason: string,
  monthsToExpire = 12
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const credits = Math.floor(amount);
  await mutateBuckets(uid, (buckets, now) => {
    const expiresAt =
      monthsToExpire > 0
        ? Timestamp.fromDate(addMonths(now.toDate(), monthsToExpire))
        : null;
    buckets.push({
      amount: credits,
      grantedAt: now,
      expiresAt,
      sourcePriceId: null,
      context: reason,
    });
    return {
      consumed: false,
      remaining: computeTotal(buckets),
      logEmpty: false,
    };
  });
}

async function decrementOne(uid: string): Promise<ConsumeResult> {
  const result = await mutateBuckets(uid, (buckets) => {
    for (const bucket of buckets) {
      if (bucket.amount > 0) {
        bucket.amount -= 1;
        return { consumed: true, remaining: 0, logEmpty: true };
      }
    }
    return { consumed: false, remaining: 0, logEmpty: true };
  });
  return result;
}

export async function consumeOne(uid: string): Promise<boolean> {
  const result = await decrementOne(uid);
  return result.consumed;
}

export async function consumeCredit(uid: string): Promise<ConsumeResult> {
  return decrementOne(uid);
}

export async function grantCredits(
  uid: string,
  amount: number,
  expiryDays: number,
  sourcePriceId: string,
  context: string
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const months = expiryDays > 0 ? Math.max(1, Math.ceil(expiryDays / 30)) : 12;
  const reason = context
    ? `${context}${sourcePriceId ? ` (${sourcePriceId})` : ""}`
    : "Credit grant";
  await mutateBuckets(uid, (buckets, now) => {
    const expiresAt =
      months > 0 ? Timestamp.fromDate(addMonths(now.toDate(), months)) : null;
    buckets.push({
      amount: Math.floor(amount),
      grantedAt: now,
      expiresAt,
      sourcePriceId: sourcePriceId || null,
      context: reason,
    });
    return {
      consumed: false,
      remaining: computeTotal(buckets),
      logEmpty: false,
    };
  });
}

export async function setSubscriptionStatus(
  uid: string,
  status: "active" | "canceled" | "none",
  priceId: string | null,
  renewalUnix: number | null
): Promise<void> {
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
