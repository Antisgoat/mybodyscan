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
  return ok;
}

/**
 * Set custom claims for a user, including unlimitedCredits for whitelisted users.
 * Preserves existing claims like staff, demo, etc.
 */
export async function setCustomClaims(uid: string, email?: string): Promise<void> {
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  const existingClaims = (user.customClaims || {}) as Record<string, any>;
  
  const newClaims = {
    ...existingClaims,
    unlimitedCredits: isWhitelisted(email),
  };
  
  await admin.auth().setCustomClaims(uid, newClaims);
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}
