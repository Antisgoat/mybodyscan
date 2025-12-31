import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { isUnlimitedUser } from "../lib/unlimitedUsers.js";
import { hasUnlimitedCreditsMirror } from "../lib/unlimitedCredits.js";
import { ensureUnlimitedEntitlements } from "../lib/unlimitedEntitlements.js";
import { ensureAdminGrantedProEntitlement } from "../lib/adminGrantPro.js";

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

  const allowlistUnlimited = isUnlimitedUser({ uid, email: email || null });
  // Also treat users as unlimited if an admin has already granted it via Firestore mirror.
  // This supports historical/admin-granted "unlimitedCredits" users who are not in the hardcoded allowlist.
  const mirrorUnlimited = allowlistUnlimited
    ? false
    : await hasUnlimitedCreditsMirror(uid);
  const shouldUnlimited = allowlistUnlimited || mirrorUnlimited;

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

  // If the unlimited status came from an admin grant (mirror), ensure the unified Pro SSoT doc
  // is updated to a durable admin Pro entitlement so Stripe/RevenueCat can't overwrite it.
  if (mirrorUnlimited) {
    try {
      const res = await ensureAdminGrantedProEntitlement(uid);
      if (res.didWrite) {
        pathsUpdated = Array.from(
          new Set([...pathsUpdated, `users/${uid}/entitlements/current`])
        );
      }
    } catch (err) {
      console.warn("refreshClaims_pro_ensure_failed", { uid, err: (err as any)?.message });
    }
  }

  console.info("refreshClaims_bootstrap", {
    uid,
    email,
    provider,
    isAdmin,
    shouldUnlimited,
    allowlistUnlimited,
    mirrorUnlimited,
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
