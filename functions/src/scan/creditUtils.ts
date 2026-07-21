/**
 * Pipeline map — Scan credit accounting:
 * - Provides transactional helpers to deduct or refund scan credits so billing stays consistent with scan lifecycle.
 * - `consumeCreditBuckets` sorts by expiry and mutates amounts, while `refundCredit` pushes a 1-credit bucket back.
 */
import type { Transaction, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "../firebase.js";

interface CreditBucket {
  amount: number;
  grantedAt: Timestamp;
  expiresAt?: Timestamp | null;
  sourcePriceId?: string | null;
  context?: string | null;
}

function activeBuckets(data: any, now: Timestamp): CreditBucket[] {
  return (Array.isArray(data?.creditBuckets) ? data.creditBuckets : [])
    .map((bucket: any) => normalizeBucket(bucket, now))
    .filter((bucket: CreditBucket) => {
      const expiresAt =
        bucket.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return bucket.amount > 0 && expiresAt > now.toMillis();
    });
}

function totalCredits(buckets: CreditBucket[]): number {
  return buckets.reduce(
    (sum: number, bucket: CreditBucket) =>
      sum + Math.max(0, bucket.amount || 0),
    0
  );
}

function normalizeBucket(raw: any, fallback: Timestamp): CreditBucket {
  return {
    amount: Number(raw?.amount || 0),
    grantedAt: raw?.grantedAt instanceof Timestamp ? raw.grantedAt : fallback,
    expiresAt: raw?.expiresAt instanceof Timestamp ? raw.expiresAt : null,
    sourcePriceId:
      typeof raw?.sourcePriceId === "string" ? raw.sourcePriceId : null,
    context: typeof raw?.context === "string" ? raw.context : null,
  };
}

export async function consumeCreditBuckets(
  tx: Transaction,
  ref: DocumentReference,
  amount: number
): Promise<{ buckets: CreditBucket[]; consumed: boolean; total: number }> {
  const snap = await tx.get(ref);
  if (!snap.exists) {
    return { buckets: [], consumed: false, total: 0 };
  }
  const data = snap.data() as any;
  const now = Timestamp.now();
  const buckets = activeBuckets(data, now);
  buckets.sort((a: CreditBucket, b: CreditBucket) => {
    const aTime = a.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  let remaining = amount;
  for (const bucket of buckets) {
    if (remaining <= 0) break;
    const expiresAt = bucket.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    if (expiresAt <= now.toMillis()) continue;
    if (bucket.amount > 0) {
      const take = Math.min(bucket.amount, remaining);
      bucket.amount -= take;
      remaining -= take;
    }
  }

  const consumed = remaining <= 0;
  const active = buckets.filter((bucket) => bucket.amount > 0);
  const total = totalCredits(active);
  return { buckets: active, consumed, total };
}

export async function grantCreditBuckets(
  tx: Transaction,
  ref: DocumentReference,
  amount: number,
  options: {
    context: string;
    sourcePriceId?: string | null;
    expiresInMonths?: number;
  }
): Promise<number> {
  const snap = await tx.get(ref);
  const now = Timestamp.now();
  const buckets = activeBuckets(snap.exists ? snap.data() : {}, now);
  const months = Number(options.expiresInMonths);
  const expiryDate = now.toDate();
  if (Number.isFinite(months) && months > 0) {
    expiryDate.setMonth(expiryDate.getMonth() + Math.floor(months));
  }
  buckets.push({
    amount: Math.max(0, Math.floor(amount)),
    grantedAt: now,
    expiresAt:
      Number.isFinite(months) && months > 0
        ? Timestamp.fromDate(expiryDate)
        : null,
    sourcePriceId: options.sourcePriceId || null,
    context: options.context,
  });
  const total = totalCredits(buckets);
  tx.set(
    ref,
    {
      creditBuckets: buckets,
      creditsSummary: { totalAvailable: total, lastUpdated: now },
    },
    { merge: true }
  );
  return total;
}

export async function refundCredit(
  tx: Transaction,
  ref: DocumentReference,
  context: string
) {
  const snap = await tx.get(ref);
  const now = Timestamp.now();
  const data = snap.exists ? snap.data() : {};
  const buckets = activeBuckets(data, now);
  buckets.push({
    amount: 1,
    grantedAt: now,
    expiresAt: null,
    sourcePriceId: null,
    context,
  });
  const total = totalCredits(buckets);
  tx.set(
    ref,
    {
      creditBuckets: buckets,
      creditsSummary: { totalAvailable: total, lastUpdated: now },
    },
    { merge: true }
  );
  return total;
}
