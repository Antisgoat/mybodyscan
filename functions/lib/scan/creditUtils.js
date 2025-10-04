import { Timestamp } from "../firebase.js";
function normalizeBucket(raw, fallback) {
    return {
        amount: Number(raw?.amount || 0),
        grantedAt: raw?.grantedAt instanceof Timestamp ? raw.grantedAt : fallback,
        expiresAt: raw?.expiresAt instanceof Timestamp ? raw.expiresAt : null,
        sourcePriceId: typeof raw?.sourcePriceId === "string" ? raw.sourcePriceId : null,
        context: typeof raw?.context === "string" ? raw.context : null,
    };
}
export async function consumeCreditBuckets(tx, ref, amount) {
    const snap = await tx.get(ref);
    if (!snap.exists) {
        return { buckets: [], consumed: false, total: 0 };
    }
    const data = snap.data();
    const now = Timestamp.now();
    const buckets = Array.isArray(data.creditBuckets)
        ? data.creditBuckets.map((bucket) => normalizeBucket(bucket, now))
        : [];
    buckets.sort((a, b) => {
        const aTime = a.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    });
    let remaining = amount;
    for (const bucket of buckets) {
        if (remaining <= 0)
            break;
        const expiresAt = bucket.expiresAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        if (expiresAt <= now.toMillis())
            continue;
        if (bucket.amount > 0) {
            const take = Math.min(bucket.amount, remaining);
            bucket.amount -= take;
            remaining -= take;
        }
    }
    const consumed = remaining <= 0;
    const total = buckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
    return { buckets, consumed, total };
}
export async function refundCredit(tx, ref, context) {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    const data = snap.exists ? snap.data() : {};
    const buckets = Array.isArray(data?.creditBuckets)
        ? data.creditBuckets.map((bucket) => normalizeBucket(bucket, now))
        : [];
    buckets.push({ amount: 1, grantedAt: now, expiresAt: null, sourcePriceId: null, context });
    const total = buckets.reduce((sum, bucket) => sum + (bucket.amount || 0), 0);
    tx.set(ref, {
        creditBuckets: buckets,
        creditsSummary: { totalAvailable: total, lastUpdated: now },
    }, { merge: true });
    return total;
}
//# sourceMappingURL=creditUtils.js.map