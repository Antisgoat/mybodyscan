import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp();
}

export const grantUnlimitedCredits = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) return { ok: false };

  await getAuth().setCustomUserClaims(uid, { admin: true, unlimited: true });
  return { ok: true };
});
