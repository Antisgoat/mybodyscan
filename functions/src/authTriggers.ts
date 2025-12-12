import { auth } from "firebase-functions/v1";
import { config } from "firebase-functions";

import { getFirestore } from "./firebase.js";
import { addCredits } from "./credits.js";
import { updateUserClaims } from "./claims.js";

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
