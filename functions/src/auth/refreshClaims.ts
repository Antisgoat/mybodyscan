import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onCallWithOptionalAppCheck } from "../util/callable.js";

if (!getApps().length) {
  initializeApp();
}

const fallbackAdmins = ["developer@adlrlabs.com", "developer@adlerlabs.com"];

function parseAdminEmails() {
  const raw = String(process.env.ADMIN_EMAILS_CSV || "");
  const entries = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...entries, ...fallbackAdmins]));
}

export const refreshClaims = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  const email = String(req.auth?.token?.email || "").trim().toLowerCase();
  if (!uid) return { ok: false };

  const adminEmails = parseAdminEmails();
  const isAdmin = Boolean(email) && adminEmails.includes(email);

  const customClaims: Record<string, any> = {};
  if (isAdmin) {
    customClaims.admin = true;
    customClaims.unlimited = true;
  }

  if (Object.keys(customClaims).length) {
    const auth = getAuth();
    const user = await auth.getUser(uid);
    const mergedClaims = { ...(user.customClaims || {}), ...customClaims };
    await auth.setCustomUserClaims(uid, mergedClaims);
  }

  return { ok: true, admin: isAdmin, claims: customClaims };
});
