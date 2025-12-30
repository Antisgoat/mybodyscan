import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { isUnlimitedUser } from "../lib/unlimitedUsers.js";
import { ensureUnlimitedEntitlements } from "../lib/unlimitedEntitlements.js";

if (!getApps().length) {
  initializeApp();
}

const fallbackAdmins = ["developer@adlrlabs.com", "developer@adlerlabs.com"];

function parseAdminEmails() {
  const raw = String(process.env.ADMIN_EMAILS_CSV || "");
  const entries = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...entries, ...fallbackAdmins]));
}

export const refreshClaims = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  const emailRaw = req.auth?.token?.email;
  const email =
    typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  if (!uid) return { ok: false };

  const provider = String((req.auth?.token as any)?.firebase?.sign_in_provider || "");

  const adminEmails = parseAdminEmails();
  const isAdmin = Boolean(email) && adminEmails.includes(email);

  const shouldUnlimited = isUnlimitedUser({ uid, email: email || null });

  const customClaims: Record<string, any> = {};
  if (isAdmin) {
    customClaims.admin = true;
    customClaims.unlimited = true;
  }
  if (shouldUnlimited) {
    customClaims.unlimitedCredits = true;
  }

  const auth = getAuth();
  let claimsUpdated = false;
  if (Object.keys(customClaims).length) {
    const user = await auth.getUser(uid);
    const existing = (user.customClaims || {}) as Record<string, unknown>;
    const needsUpdate = Object.entries(customClaims).some(
      ([k, v]) => existing[k] !== v
    );
    if (needsUpdate) {
      const mergedClaims = { ...existing, ...customClaims };
      await auth.setCustomUserClaims(uid, mergedClaims);
      claimsUpdated = true;
    }
  }

  let unlimitedUpdated = false;
  let pathsUpdated: string[] = [];
  if (shouldUnlimited) {
    const ensured = await ensureUnlimitedEntitlements({
      uid,
      email: email || null,
      provider: provider || null,
      source: "refreshClaims",
    });
    unlimitedUpdated = ensured.didGrant;
    pathsUpdated = ensured.pathsUpdated;
    claimsUpdated = claimsUpdated || ensured.didSetClaims;
  }

  console.info("refreshClaims_bootstrap", {
    uid,
    email,
    provider,
    isAdmin,
    shouldUnlimited,
    claimsUpdated,
    unlimitedUpdated,
    pathsUpdated,
  });

  return {
    ok: true,
    admin: isAdmin,
    claims: customClaims,
    claimsUpdated,
    unlimitedCredits: shouldUnlimited,
    unlimitedUpdated,
    pathsUpdated,
  };
});
