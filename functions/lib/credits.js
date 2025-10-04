import { FieldValue, Timestamp, getFirestore } from "./firebase.js";
const db = getFirestore();
const MAX_TRANSACTION_ATTEMPTS = 5;
function getSummaryRef(uid) {
    return db.doc(`users/${uid}/private/credits`);
}
function addMonths(base, months) {
    const copy = new Date(base.getTime());
    copy.setMonth(copy.getMonth() + months);
    return copy;
}
function sanitizeBucket(raw, now) {
    const amount = Math.max(0, Math.floor(Number(raw?.amount ?? 0)));
    if (!amount)
        return null;
    const grantedAt = raw?.grantedAt instanceof Timestamp ? raw.grantedAt : now;
    const expiresAt = raw?.expiresAt instanceof Timestamp ? raw.expiresAt : null;
    if (expiresAt && expiresAt.toMillis() <= now.toMillis()) {
        return null;
    }
    return {
        amount,
        grantedAt,
        expiresAt,
        sourcePriceId: typeof raw?.sourcePriceId === "string" ? raw.sourcePriceId : null,
        context: typeof raw?.context === "string" ? raw.context : null,
    };
}
function normalizeBuckets(data, now) {
    const rawBuckets = Array.isArray(data?.creditBuckets) ? data.creditBuckets : [];
    const buckets = rawBuckets
        .map((bucket) => sanitizeBucket(bucket, now))
        .filter((bucket) => bucket !== null);
    buckets.sort((a, b) => {
        const aExpires = a.expiresAt ? a.expiresAt.toMillis() : Number.MAX_SAFE_INTEGER;
        const bExpires = b.expiresAt ? b.expiresAt.toMillis() : Number.MAX_SAFE_INTEGER;
        if (aExpires !== bExpires) {
            return aExpires - bExpires;
        }
        return a.grantedAt.toMillis() - b.grantedAt.toMillis();
    });
    return buckets;
}
function computeTotal(buckets) {
    return buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
}
async function runWithRetry(fn) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
    }
    throw lastError;
}
async function mutateBuckets(uid, mutator) {
    return runWithRetry(async () => {
        const ref = getSummaryRef(uid);
        return db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const now = Timestamp.now();
            const buckets = snap.exists ? normalizeBuckets(snap.data(), now) : [];
            const beforeTotal = computeTotal(buckets);
            const result = mutator(buckets, now);
            const afterBuckets = buckets.filter((bucket) => bucket.amount > 0);
            const total = computeTotal(afterBuckets);
            tx.set(ref, {
                creditBuckets: afterBuckets,
                creditsSummary: {
                    totalAvailable: total,
                    lastUpdated: now,
                    version: FieldValue.increment(1),
                },
                creditVersion: FieldValue.increment(1),
            }, { merge: true });
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
export async function refreshCreditsSummary(uid) {
    await mutateBuckets(uid, (buckets) => ({ consumed: false, remaining: computeTotal(buckets), logEmpty: false }));
}
export async function addCredits(uid, amount, reason, monthsToExpire = 12) {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
    const credits = Math.floor(amount);
    await mutateBuckets(uid, (buckets, now) => {
        const expiresAt = monthsToExpire > 0
            ? Timestamp.fromDate(addMonths(now.toDate(), monthsToExpire))
            : null;
        buckets.push({
            amount: credits,
            grantedAt: now,
            expiresAt,
            sourcePriceId: null,
            context: reason,
        });
        return { consumed: false, remaining: computeTotal(buckets), logEmpty: false };
    });
}
async function decrementOne(uid) {
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
export async function consumeOne(uid) {
    const result = await decrementOne(uid);
    return result.consumed;
}
export async function consumeCredit(uid) {
    return decrementOne(uid);
}
export async function grantCredits(uid, amount, expiryDays, sourcePriceId, context) {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
    const months = expiryDays > 0 ? Math.max(1, Math.ceil(expiryDays / 30)) : 12;
    const reason = context
        ? `${context}${sourcePriceId ? ` (${sourcePriceId})` : ""}`
        : "Credit grant";
    await mutateBuckets(uid, (buckets, now) => {
        const expiresAt = months > 0
            ? Timestamp.fromDate(addMonths(now.toDate(), months))
            : null;
        buckets.push({
            amount: Math.floor(amount),
            grantedAt: now,
            expiresAt,
            sourcePriceId: sourcePriceId || null,
            context: reason,
        });
        return { consumed: false, remaining: computeTotal(buckets), logEmpty: false };
    });
}
export async function setSubscriptionStatus(uid, status, priceId, renewalUnix) {
    await db.doc(`users/${uid}`).set({
        subscription: {
            status,
            planPriceId: priceId,
            renewalDate: renewalUnix ? new Date(renewalUnix * 1000) : null,
        },
    }, { merge: true });
}
//# sourceMappingURL=credits.js.map