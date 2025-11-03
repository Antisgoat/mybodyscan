import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp();
}

const adminEmails = (process.env.ADMIN_EMAILS_CSV || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export const refreshClaims = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  const email = (req.auth?.token?.email || "").toLowerCase();
  if (!uid) return { ok: false };

  const customClaims: Record<string, any> = {};
  if (email && adminEmails.includes(email)) {
    customClaims.admin = true;
    customClaims.unlimited = true;
  }

  if (Object.keys(customClaims).length) {
    await getAuth().setCustomUserClaims(uid, customClaims);
  }

  return { ok: true, claims: customClaims };
});
