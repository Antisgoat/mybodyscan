import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { getEnv } from "./lib/env.js";
import { isWhitelisted } from "./testWhitelist.js";

function initializeFirebaseIfNeeded() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
}

function getClaimsAllowlist(): string[] {
  const raw = getEnv("CLAIMS_ALLOWLIST") || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function ensureCustomClaims(email?: string): Promise<boolean> {
  const allow = getClaimsAllowlist();
  const ok = !!email && allow.includes((email || "").toLowerCase());
  return ok;
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}

export async function updateUserClaims(
  uid: string,
  email?: string
): Promise<void> {
  if (!uid) return;
  initializeFirebaseIfNeeded();

  const user = await admin.auth().getUser(uid);
  const existingClaims = user.customClaims || {};

  // Set unlimitedCredits if user is whitelisted
  const updatedClaims = {
    ...existingClaims,
    unlimitedCredits: isWhitelisted(email || user.email),
  };

  await admin.auth().setCustomUserClaims(uid, updatedClaims);
}

export const refreshClaims = onCall(
  { region: "us-central1" },
  async (request) => {
    const { auth } = request;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const tokenEmail =
      typeof auth.token?.email === "string" ? auth.token.email : undefined;
    const unlimitedFromToken = auth.token?.unlimitedCredits === true;

    if (!isWhitelisted(tokenEmail)) {
      return { updated: false, unlimitedCredits: unlimitedFromToken === true };
    }

    if (unlimitedFromToken) {
      return { updated: false, unlimitedCredits: true };
    }

    initializeFirebaseIfNeeded();
    const userRecord = await admin.auth().getUser(auth.uid);
    const existingClaims = userRecord.customClaims || {};

    if ((existingClaims as any)?.unlimitedCredits === true) {
      return { updated: false, unlimitedCredits: true };
    }

    await admin.auth().setCustomUserClaims(auth.uid, {
      ...existingClaims,
      unlimitedCredits: true,
    });

    return { updated: true, unlimitedCredits: true };
  }
);

/**
 * grantUnlimitedCredits(email): Minimal admin callable to grant unlimitedCredits=true.
 * Restricted to callers with staff:true.
 */
export const grantUnlimitedCredits = onCall(
  { region: "us-central1" },
  async (request) => {
    const { auth, data } = request as {
      auth?: { uid: string; token?: any };
      data?: { email?: string };
    };
    if (!auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    initializeFirebaseIfNeeded();
    const caller = await admin.auth().getUser(auth.uid);
    const isCallerStaff = Boolean((caller.customClaims as any)?.staff === true);
    if (!isCallerStaff) {
      throw new HttpsError("permission-denied", "Staff role required");
    }

    const email =
      typeof data?.email === "string" ? data!.email.trim().toLowerCase() : "";
    if (!email) {
      throw new HttpsError("invalid-argument", "email is required");
    }

    let target;
    try {
      target = await admin.auth().getUserByEmail(email);
    } catch (err) {
      throw new HttpsError("not-found", "user_not_found");
    }

    const existing = target.customClaims || {};
    await admin
      .auth()
      .setCustomUserClaims(target.uid, { ...existing, unlimitedCredits: true });
    return { ok: true, uid: target.uid };
  }
);
