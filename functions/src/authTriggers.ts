import { auth } from "firebase-functions/v1";
import { config } from "firebase-functions";
type AuthUser = {
  uid: string;
  email?: string | null;
};

import { getAuth, getFirestore } from "./firebase.js";
import { addCredits } from "./credits.js";
import { ensureTestCredits, updateUserClaims } from "./claims.js";

const db = getFirestore();
const adminAuth = getAuth();

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

export const onAuthCreate = auth.user().onCreate(async (user: AuthUser) => {
  const { uid, email } = user;
  const normalizedEmail = email?.toLowerCase() ?? null;

  await Promise.all([
    updateUserClaims(uid, normalizedEmail ?? undefined),
    ensureTestCredits(uid, normalizedEmail ?? undefined),
  ]);

  if (normalizedEmail === "developer@adlrlabs.com") {
    const record = await adminAuth.getUser(uid);
    const existing = record.customClaims ?? {};
    const nextClaims = {
      ...existing,
      developer: true,
      tester: true,
      unlimitedCredits: true,
      credits: 999_999,
      demo: false,
    };
    await adminAuth.setCustomUserClaims(uid, nextClaims);
    await Promise.all([
      db.doc(`users/${uid}`).set(
        {
          credits: 999_999,
          demo: false,
          meta: { developer: true },
        },
        { merge: true },
      ),
      db.doc(`users/${uid}/private/profile`).set(
        {
          developer: true,
          demo: false,
        },
        { merge: true },
      ),
    ]);
  }

  if (!normalizedEmail) return;
  const founders = parseFounderEmails();
  if (!founders.has(normalizedEmail)) return;

  console.info("founder_signup", { uid, email: normalizedEmail });
  await Promise.all([
    addCredits(uid, 30, "Founder", 12),
    db.doc(`users/${uid}`).set(
      {
        meta: { founder: true },
      },
      { merge: true },
    ),
  ]);
});
