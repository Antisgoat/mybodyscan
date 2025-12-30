import { auth } from "firebase-functions/v1";
import { config } from "firebase-functions";

import { getFirestore } from "./firebase.js";
import { addCredits } from "./credits.js";
import { updateUserClaims } from "./claims.js";
import { isUnlimitedUser } from "./lib/unlimitedUsers.js";
import { ensureUnlimitedEntitlements } from "./lib/unlimitedEntitlements.js";

const db = getFirestore();

function parseFounderEmails(): Set<string> {
  try {
    const raw = config().founders?.emails as string | undefined;
    if (!raw) return new Set();
    const entries = raw
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return new Set(entries);
  } catch {
    return new Set();
  }
}

export const handleUserCreate = auth.user().onCreate(async (user: any) => {
  const email = user.email?.toLowerCase();
  const uid = user.uid;

  // Update user claims (including unlimitedCredits for whitelisted users)
  await updateUserClaims(uid, email);

  // Guarantee unlimited credits for allowlisted UIDs/emails, even when Apple provides no stable email.
  const provider =
    Array.isArray(user?.providerData) && user.providerData.length
      ? String(user.providerData[0]?.providerId || "")
      : "";
  const shouldUnlimited = isUnlimitedUser({ uid, email: email || null });
  if (shouldUnlimited) {
    await ensureUnlimitedEntitlements({
      uid,
      email: email || null,
      provider: provider || null,
      source: "authTrigger",
    });
  }

  if (!email) return;
  const founders = parseFounderEmails();
  if (!founders.has(email)) return;

  console.info("founder_signup", { uid, email });
  await Promise.all([
    addCredits(uid, 30, "Founder", 12),
    db.doc(`users/${uid}`).set(
      {
        meta: { founder: true },
      },
      { merge: true }
    ),
  ]);
});
