import { getEnv } from "./lib/env.js";
import { getAuth } from "./firebase.js";

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  const user = await getAuth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
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
