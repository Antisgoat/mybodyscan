import { getAuth } from "./firebase.js";
import { getEnv } from "./lib/env.js";

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

export async function ensureCustomClaims(email?: string): Promise<void> {
  const allow = getClaimsAllowlist();
  const normalized = (email || "").toLowerCase();
  if (!normalized || !allow.includes(normalized)) return;
  try {
    const user = await getAuth().getUserByEmail(normalized);
    const existing = (user.customClaims as any) || {};
    if (existing.staff === true) return;
    await getAuth().setCustomUserClaims(user.uid, { ...existing, staff: true });
  } catch {
    // Silent: do not throw on claim ensure attempts
  }
}
