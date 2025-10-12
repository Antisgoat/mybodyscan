import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getEnv } from "./lib/env.js";

if (!getApps || !getApps().length) {
  initializeApp();
}

function getClaimsAllowlist(): string[] {
  const raw = getEnv("CLAIMS_ALLOWLIST") || "";
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export async function ensureCustomClaims(email?: string) {
  const allow = getClaimsAllowlist();
  const ok = !!email && allow.includes((email || "").toLowerCase());
  // keep existing behavior, just guarded
  return ok;
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  const user = await getAuth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}
