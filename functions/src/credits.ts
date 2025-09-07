import { getFirestore, Timestamp } from "firebase-admin/firestore";

export async function grantCredits(uid: string, amount: number, expiryDays: number, sourcePriceId: string, context: string) {
  const db = getFirestore();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + expiryDays*24*60*60*1000);
  const userRef = db.doc(`users/${uid}`);
  const bucketsRef = userRef.collection("private").doc("credits");

  await db.runTransaction(async tx => {
    const snap = await tx.get(bucketsRef);
    const data = snap.exists ? snap.data()! : { creditBuckets: [], creditsSummary: { totalAvailable: 0, lastUpdated: now } };
    data.creditBuckets.push({ amount, grantedAt: now, expiresAt, sourcePriceId, context });
    const total = (data.creditBuckets as any[]).reduce((sum, b) => sum + (b.amount||0), 0);
    data.creditsSummary = { totalAvailable: total, lastUpdated: now };
    tx.set(bucketsRef, data, { merge: true });
  });
}

export async function refreshCreditsSummary(uid: string) {
  const db = getFirestore();
  const bucketsRef = db.doc(`users/${uid}/private/credits`);
  const snap = await bucketsRef.get();
  if (!snap.exists) return;
  const data = snap.data()!;
  const total = (data.creditBuckets || []).reduce((s:number, b:any)=> s + (b.amount||0), 0);
  await bucketsRef.set({ creditsSummary: { totalAvailable: total, lastUpdated: Timestamp.now() }}, { merge: true });
}

export async function consumeCredit(uid: string): Promise<boolean> {
  const db = getFirestore();
  const bucketsRef = db.doc(`users/${uid}/private/credits`);
  let ok = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bucketsRef);
    if (!snap.exists) return;
    const data = snap.data() as any;
    const now = Timestamp.now();
    const buckets = (data.creditBuckets || []).filter(
      (b: any) => b.expiresAt.toMillis() > now.toMillis()
    );
    buckets.sort(
      (a: any, b: any) => a.expiresAt.toMillis() - b.expiresAt.toMillis()
    );
    for (const b of buckets) {
      if ((b.amount || 0) > 0) {
        b.amount -= 1;
        ok = true;
        break;
      }
    }
    const total = buckets.reduce(
      (s: number, b: any) => s + (b.amount || 0),
      0
    );
    tx.set(
      bucketsRef,
      {
        creditBuckets: buckets,
        creditsSummary: { totalAvailable: total, lastUpdated: now },
      },
      { merge: true }
    );
  });
  return ok;
}

export async function setSubscriptionStatus(
  uid: string,
  status: "active" | "canceled" | "none",
  priceId: string | null,
  renewalUnix: number | null
) {
  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      subscription: {
        status,
        planPriceId: priceId || null,
        renewalDate: renewalUnix ? new Date(renewalUnix * 1000) : null,
      },
    },
    { merge: true }
  );
}
