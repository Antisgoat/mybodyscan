import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { CallableRequest, Request } from "firebase-functions/v2/https";
import { verifyAppCheckSoft } from "./http.js";
import { softVerifyAppCheck } from "./middleware/appCheck.js";
import { consumeCredit, refreshCreditsSummary } from "./credits.js";
import { getFirestore } from "./firebase.js";

const db = getFirestore();

async function consumeUserCredit(uid: string) {
  const ok = await consumeCredit(uid);
  if (!ok) {
    throw new HttpsError("resource-exhausted", "no_credits");
  }
  await refreshCreditsSummary(uid);
  const snap = await db.doc(`users/${uid}/private/credits`).get();
  const remaining = (snap.data()?.creditsSummary?.totalAvailable as number | undefined) || 0;
  return { ok: true as const, remaining };
}

export const useCredit = onCall(
  async (request: CallableRequest<unknown>) => {
    const rawRequest = request.rawRequest as Request | undefined;
    if (rawRequest) {
      await softVerifyAppCheck(rawRequest as any, {} as any);
      await verifyAppCheckSoft(rawRequest);
    }

    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    return consumeUserCredit(uid);
  }
);
