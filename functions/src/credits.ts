import { Timestamp, getFirestore } from "./firebase.js";

const db = getFirestore();

interface LedgerEntry {
  amount: number;
  reason: string;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
  consumedAt: Timestamp | null;
}

function getLedgerCollection(uid: string) {
  return db.collection("users").doc(uid).collection("credits");
}

function getSummaryRef(uid: string) {
  return db.doc(`users/${uid}/private/credits`);
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function buildLedgerEntry(now: Timestamp, reason: string, monthsToExpire: number): LedgerEntry {
  const expiresAt = monthsToExpire > 0 ? Timestamp.fromDate(addMonths(now.toDate(), monthsToExpire)) : null;
  return {
    amount: 1,
    reason,
    createdAt: now,
    expiresAt,
    consumedAt: null,
  };
}

async function writeSummary(uid: string, remaining: number, now: Timestamp) {
  await getSummaryRef(uid).set(
    {
      creditsSummary: {
        totalAvailable: remaining,
        lastUpdated: now,
      },
    },
    { merge: true }
  );
}

export async function refreshCreditsSummary(uid: string) {
  const col = getLedgerCollection(uid);
  const now = Timestamp.now();
  const snap = await col.where("consumedAt", "==", null).get();
  const remaining = snap.docs.filter((doc) => {
    const expiresAt = doc.data()?.expiresAt as Timestamp | undefined;
    if (!expiresAt) return true;
    return expiresAt.toMillis() > now.toMillis();
  }).length;
  await writeSummary(uid, remaining, now);
}

export async function addCredits(
  uid: string,
  amount: number,
  reason: string,
  monthsToExpire = 12
) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const col = getLedgerCollection(uid);
  const now = Timestamp.now();
  const batch = db.batch();
  const entry = buildLedgerEntry(now, reason, monthsToExpire);
  for (let i = 0; i < Math.floor(amount); i += 1) {
    const ref = col.doc();
    batch.set(ref, entry);
  }
  await batch.commit();
  await refreshCreditsSummary(uid);
}

export async function consumeOne(uid: string): Promise<boolean> {
  const col = getLedgerCollection(uid);
  const now = Timestamp.now();
  const querySnap = await col.where("consumedAt", "==", null).orderBy("expiresAt", "asc").get();
  if (querySnap.empty) {
    await refreshCreditsSummary(uid);
    return false;
  }
  for (const docSnap of querySnap.docs) {
    const data = docSnap.data() as LedgerEntry;
    const expiresAt = data.expiresAt;
    if (expiresAt && expiresAt.toMillis() <= now.toMillis()) {
      await docSnap.ref.update({ consumedAt: now, expired: true });
      continue;
    }
    await docSnap.ref.update({ consumedAt: now });
    await refreshCreditsSummary(uid);
    return true;
  }
  await refreshCreditsSummary(uid);
  return false;
}

export async function grantCredits(
  uid: string,
  amount: number,
  expiryDays: number,
  sourcePriceId: string,
  context: string
) {
  const months = expiryDays > 0 ? Math.max(1, Math.ceil(expiryDays / 30)) : 12;
  const reason = context ? `${context}${sourcePriceId ? ` (${sourcePriceId})` : ""}` : "Credit grant";
  await addCredits(uid, amount, reason, months);
}

export async function consumeCredit(uid: string): Promise<boolean> {
  const consumed = await consumeOne(uid);
  if (!consumed) {
    return false;
  }
  return true;
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
