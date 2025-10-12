import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase.js";
import { addCredits } from "./credits.js";

const db = getFirestore();
const CONFIG_PATH = "config/app";

// Test whitelist for unlimited credits
export const TEST_WHITELIST = ["developer@adlrlabs.com"];

/**
 * Checks if an email is whitelisted for unlimited credits.
 * 
 * Test scenario:
 * - developer@adlrlabs.com should return true
 * - any other email should return false
 * - null/undefined email should return false
 */
export const isWhitelisted = (email?: string): boolean => {
  return !!email && TEST_WHITELIST.includes(email.toLowerCase());
};

const MIN_TEST_CREDITS = 3;

function normalizeEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean);
}

async function ensureConfigWhitelist(): Promise<Set<string>> {
  const ref = db.doc(CONFIG_PATH);
  const snap = await ref.get();
  const existing = normalizeEmails(snap.exists ? (snap.data() as any)?.testWhitelist : []);
  const merged = Array.from(new Set([...existing, ...TEST_WHITELIST]));
  await ref.set(
    {
      testWhitelist: merged,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return new Set(merged.map((email) => email.toLowerCase()));
}

async function currentCreditTotal(uid: string): Promise<number> {
  const ref = db.doc(`users/${uid}/private/credits`);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  const total = Number((snap.data() as any)?.creditsSummary?.totalAvailable ?? 0);
  return Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
}

export const ensureTestCredits = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email?.toLowerCase();
  const demo = Boolean(request.data?.demo);

  if (!uid || !email) {
    throw new HttpsError("unauthenticated", "Sign in to sync credits");
  }

  if (demo) {
    return { granted: 0, total: await currentCreditTotal(uid) };
  }

  const whitelist = await ensureConfigWhitelist();
  if (!whitelist.has(email)) {
    return { granted: 0, total: await currentCreditTotal(uid) };
  }

  const before = await currentCreditTotal(uid);
  if (before >= MIN_TEST_CREDITS) {
    return { granted: 0, total: before };
  }

  const needed = MIN_TEST_CREDITS - before;
  await addCredits(uid, needed, "Test whitelist grant", 12);

  const after = await currentCreditTotal(uid);
  return { granted: Math.max(after - before, 0), total: after };
});
