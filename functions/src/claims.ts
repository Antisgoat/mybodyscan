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

export async function setCustomClaims(uid: string, email?: string): Promise<void> {
  if (!uid) return;
  
  initializeFirebaseIfNeeded();
  
  const claims: any = {};
  
  // Set staff claim if in allowlist
  const isAllowed = await ensureCustomClaims(email);
  if (isAllowed) {
    claims.staff = true;
  }
  
  // Set unlimitedCredits claim if whitelisted
  if (isWhitelisted(email)) {
    claims.unlimitedCredits = true;
  }
  
  // Only update claims if there are changes
  if (Object.keys(claims).length > 0) {
    await admin.auth().setCustomUserClaims(uid, claims);
  }
}
