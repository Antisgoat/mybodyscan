import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase.js";
import { consumeCreditBuckets } from "./creditUtils.js";
import type { ScanCreditAccess } from "./creditAuthorization.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { enforceMonthlyQuota } from "../middleware/monthlyQuota.js";

export const UPLOAD_LEASE_MS = 60 * 60 * 1000;

/** Preflight only: the existing submit transaction remains the sole debit. */
export async function requireUploadCredit(
  uid: string,
  access: ScanCreditAccess,
  db = getFirestore()
) {
  if (access.bypass) return;
  const available = await db.runTransaction(async (tx) => {
    const result = await consumeCreditBuckets(
      tx,
      db.doc(`users/${uid}/private/credits`),
      0
    );
    return result.total;
  });
  if (available < 1) {
    throw new HttpsError("failed-precondition", "No scan credits available.", {
      reason: "no_credits",
    });
  }
}

/** Failed/abandoned sessions still count: limits bound storage abuse, not billing. */
export async function reserveUploadSession(
  uid: string,
  access: ScanCreditAccess,
  deps = {
    requireCredit: requireUploadCredit,
    rateLimit: enforceRateLimit,
    monthlyQuota: enforceMonthlyQuota,
  }
) {
  await deps.requireCredit(uid, access);
  await deps.rateLimit({
    uid,
    key: "scan_upload_session",
    limit: 8,
    windowMs: UPLOAD_LEASE_MS,
  });
  await deps.monthlyQuota({
    uid,
    key: "scan_upload_session",
    limit: access.bypass ? 120 : 60,
  });
  return Timestamp.fromMillis(Date.now() + UPLOAD_LEASE_MS);
}
