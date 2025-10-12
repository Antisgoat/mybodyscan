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

export async function ensureCustomClaims(email?: string): Promise<boolean> {
  const allow = getClaimsAllowlist();
  const ok = !!email && allow.includes((email || "").toLowerCase());
  // Also consider durable test whitelist here for callers that use this boolean
  return ok || isWhitelisted(email);
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  const claims = (user.customClaims as any) || {};
  return Boolean(claims?.staff === true);
}

// Idempotent helper for setting unlimitedCredits for test allowlist
export async function ensureUnlimitedCredits(uid: string): Promise<void> {
  initializeFirebaseIfNeeded();
  const auth = admin.auth();
  const user = await auth.getUser(uid);
  const email = user.email?.toLowerCase();
  if (!email) return;
  const claims = { ...(user.customClaims || {}) } as Record<string, unknown>;
  const shouldHaveUnlimited = isWhitelisted(email);
  if (shouldHaveUnlimited && claims.unlimitedCredits !== true) {
    claims.unlimitedCredits = true;
    await auth.setCustomUserClaims(uid, claims);
    try { await auth.revokeRefreshTokens(uid); } catch { /* no-op */ }
  }
}
