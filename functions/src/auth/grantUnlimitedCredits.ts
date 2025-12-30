import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { getEnv } from "../lib/env.js";
import {
  grantUnlimitedCreditsHandler,
  type GrantUnlimitedCreditsDeps,
} from "./grantUnlimitedCreditsHandler.js";

if (!getApps().length) {
  initializeApp();
}

export const grantUnlimitedCredits = onCallWithOptionalAppCheck(async (req) => {
  const rawAllowlist = (getEnv("ADMIN_EMAIL_ALLOWLIST") || "").trim();
  const fallback = ["developer@adlrlabs.com", "developer@adlerlabs.com"];
  const allowlist = new Set(
    [...rawAllowlist.split(","), ...fallback]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const auth = getAuth();
  const db = getFirestore();

  const deps: GrantUnlimitedCreditsDeps = {
    adminEmailAllowlist: allowlist,
    nowIso: () => new Date().toISOString(),
    getUserByEmail: async (email: string) => {
      const record = await auth.getUserByEmail(email);
      return {
        uid: record.uid,
        email: record.email ?? null,
        customClaims: (record.customClaims || {}) as unknown,
      };
    },
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
      await auth.setCustomUserClaims(uid, claims);
    },
    writeUnlimitedCreditsMirror: async (params) => {
      const at = Timestamp.now();
      const payload = {
        unlimitedCredits: params.enabled,
        unlimitedCreditsUpdatedAt: at,
        unlimitedCreditsGrantedBy: params.grantedByEmail,
        unlimitedCreditsGrantedByUid: params.grantedByUid,
        // Back-compat with existing admin gateway fields
        unlimitedUpdatedAt: at,
        unlimitedUpdatedBy: params.grantedByUid,
      };

      await Promise.all([
        db.doc(`users/${params.uid}/private/admin`).set(payload, { merge: true }),
        db.doc(`users/${params.uid}`).set(payload, { merge: true }),
      ]);
    },
  };

  return await grantUnlimitedCreditsHandler(
    {
      auth: req.auth
        ? { uid: req.auth.uid, token: (req.auth.token || {}) as any }
        : undefined,
      data: (req.data || {}) as any,
    },
    deps
  );
});
