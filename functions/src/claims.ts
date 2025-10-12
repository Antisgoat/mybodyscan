import * as admin from "firebase-admin";
import { getEnv } from "./lib/env.js";
import { isWhitelisted } from "./testWhitelist.js";

function initializeFirebaseIfNeeded() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
}

function getClaimsAllowlist(): string[] {
  const raw = getEnv("CLAIMS_ALLOWLIST") || "";
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Ensure custom claims are set for a user. If the email is in the test allowlist,
 * we add { unlimitedCredits: true } while preserving existing claims.
 */
export async function ensureCustomClaims(email?: string): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase();

  initializeFirebaseIfNeeded();
  const auth = admin.auth();
  try {
    const user = await auth.getUserByEmail(normalized);
    const existing = (user.customClaims || {}) as Record<string, unknown>;

    const allow = getClaimsAllowlist();
    const envAllowlisted = allow.includes(normalized);
    const testAllowlisted = isWhitelisted(normalized);
    const wantUnlimited = envAllowlisted || testAllowlisted;

    const currentUnlimited = existing.unlimitedCredits === true;
    if (wantUnlimited !== currentUnlimited) {
      const updated = { ...existing, unlimitedCredits: wantUnlimited };
      await auth.setCustomUserClaims(user.uid, updated);
    }
    return wantUnlimited;
  } catch (err) {
    // If user lookup fails, we cannot set claims
    return false;
  }
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}
