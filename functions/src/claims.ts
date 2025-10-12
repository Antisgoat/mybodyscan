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

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  initializeFirebaseIfNeeded();
  const user = await admin.auth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}

/**
 * Sets custom claims for a user, including unlimitedCredits for whitelisted users.
 * Preserves existing claims while updating specific ones.
 */
export async function setUserCustomClaims(uid: string, email?: string, additionalClaims?: Record<string, any>): Promise<void> {
  initializeFirebaseIfNeeded();
  
  // Get existing claims to preserve them
  const user = await admin.auth().getUser(uid);
  const existingClaims = user.customClaims || {};
  
  // Determine if user should have unlimited credits
  const unlimitedCredits = isWhitelisted(email);
  
  // Merge existing claims with new ones, ensuring unlimitedCredits is set correctly
  const newClaims = {
    ...existingClaims,
    ...additionalClaims,
    unlimitedCredits,
  };
  
  // Only update if claims have actually changed
  const claimsChanged = JSON.stringify(existingClaims) !== JSON.stringify(newClaims);
  
  if (claimsChanged) {
    await admin.auth().setCustomUserClaims(uid, newClaims);
    console.info("claims_updated", { uid, email, unlimitedCredits, hasAdditionalClaims: !!additionalClaims });
  }
}
