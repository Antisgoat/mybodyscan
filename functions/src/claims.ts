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

export async function updateUserClaims(uid: string, email?: string): Promise<void> {
  if (!uid) return;
  initializeFirebaseIfNeeded();
  
  const user = await admin.auth().getUser(uid);
  const existingClaims = user.customClaims || {};
  
  // Set unlimitedCredits if user is whitelisted
  const updatedClaims = {
    ...existingClaims,
    unlimitedCredits: isWhitelisted(email || user.email)
  };
  
  await admin.auth().setCustomUserClaims(uid, updatedClaims);
}
