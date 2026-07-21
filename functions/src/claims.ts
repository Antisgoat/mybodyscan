import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "./firebase.js";

import { getEnv } from "./lib/env.js";
import { isWhitelisted } from "./testWhitelist.js";
import { isUnlimitedUser } from "./lib/unlimitedUsers.js";

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
  const user = await getAuth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}

export async function updateUserClaims(
  uid: string,
  email?: string
): Promise<void> {
  if (!uid) return;
  const user = await getAuth().getUser(uid);
  const existingClaims = user.customClaims || {};

  // Set unlimitedCredits if user is whitelisted
  const updatedClaims = {
    ...existingClaims,
    unlimitedCredits: isUnlimitedUser({
      uid,
      email: (email || user.email || "").toString(),
    })
      ? true
      : isWhitelisted(email || user.email),
  };

  await getAuth().setCustomUserClaims(uid, updatedClaims);
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

    const userRecord = await getAuth().getUser(auth.uid);
    const existingClaims = userRecord.customClaims || {};

    if ((existingClaims as any)?.unlimitedCredits === true) {
      return { updated: false, unlimitedCredits: true };
    }

    await getAuth().setCustomUserClaims(auth.uid, {
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

    const caller = await getAuth().getUser(auth.uid);
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
      target = await getAuth().getUserByEmail(email);
    } catch (err) {
      throw new HttpsError("not-found", "user_not_found");
    }

    const existing = target.customClaims || {};
    await getAuth().setCustomUserClaims(target.uid, {
      ...existing,
      unlimitedCredits: true,
    });
    return { ok: true, uid: target.uid };
  }
);
