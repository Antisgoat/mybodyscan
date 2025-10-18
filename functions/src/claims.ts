import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { FieldValue, Timestamp, getFirestore } from "./firebase.js";
import type { Transaction } from "firebase-admin/firestore";
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

export async function ensureTestCredits(uid: string, email?: string | null): Promise<void> {
  if (!uid) return;
  const normalizedEmail = email?.toLowerCase() ?? "";
  if (!normalizedEmail || !isWhitelisted(normalizedEmail)) return;

  initializeFirebaseIfNeeded();

  const auth = admin.auth();
  const user = await auth.getUser(uid);
  const existingClaims = user.customClaims ?? {};
  const nextClaims = {
    ...existingClaims,
    tester: true,
    unlimitedCredits: true,
  };

  if (existingClaims.tester !== true || existingClaims.unlimitedCredits !== true) {
    await auth.setCustomUserClaims(uid, nextClaims);
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const creditsRef = db.doc(`users/${uid}/private/credits`);

  await db.runTransaction(async (tx: Transaction) => {
    // Legacy convenience top-level hint (non-authoritative)
    const userSnap = await tx.get(userRef);
    const currentCredits = userSnap.exists ? (userSnap.data() as any)?.credits : undefined;
    const numericCredits = typeof currentCredits === "number" ? currentCredits : NaN;
    if (!userSnap.exists || !Number.isFinite(numericCredits) || numericCredits < 100) {
      tx.set(
        userRef,
        { credits: 9999, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    // Authoritative credit buckets summary for UI
    const now = Timestamp.now();
    const creditSnap = await tx.get(creditsRef);
    const summary = creditSnap.exists ? (creditSnap.data() as any)?.creditsSummary : undefined;
    const totalAvailable = Number(summary?.totalAvailable ?? 0);
    if (!creditSnap.exists || !Number.isFinite(totalAvailable) || totalAvailable < 9999) {
      tx.set(
        creditsRef,
        {
          creditBuckets: [
            { amount: 9999, grantedAt: now, expiresAt: null, sourcePriceId: null, context: "tester_grant" },
          ],
          creditsSummary: {
            totalAvailable: 9999,
            lastUpdated: now,
            lastDeductionAt: null,
            lastDeductionReason: null,
            version: FieldValue.increment(1),
          },
          creditVersion: FieldValue.increment(1),
        },
        { merge: true },
      );
    }
  });
}

export async function ensureDeveloperClaims(uid: string): Promise<void> {
  if (!uid) return;
  initializeFirebaseIfNeeded();

  const auth = admin.auth();
  const record = await auth.getUser(uid);
  const existingClaims = record.customClaims ?? {};
  const nextClaims = {
    ...existingClaims,
    role: "dev",
    developer: true,
    tester: true,
    unlimitedCredits: true,
    credits: 999_999,
    demo: false,
  };

  await auth.setCustomUserClaims(uid, nextClaims);

  const db = getFirestore();
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

export async function updateUserClaims(uid: string, email?: string): Promise<void> {
  if (!uid) return;
  initializeFirebaseIfNeeded();

  const user = await admin.auth().getUser(uid);
  const existingClaims = user.customClaims || {};
  const normalizedEmail = (email || user.email || "").toLowerCase();
  const tester = normalizedEmail ? isWhitelisted(normalizedEmail) : false;

  const updatedClaims = {
    ...existingClaims,
    tester: existingClaims.tester === true || tester,
    unlimitedCredits: existingClaims.unlimitedCredits === true || tester,
  };

  await admin.auth().setCustomUserClaims(uid, updatedClaims);
}

export const refreshClaims = onCall({ region: "us-central1" }, async (request) => {
  const { auth } = request;
  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  initializeFirebaseIfNeeded();

  const userRecord = await admin.auth().getUser(auth.uid);
  const existingClaims = userRecord.customClaims ?? {};
  const email = typeof auth.token?.email === "string" ? auth.token.email : userRecord.email;
  const isDeveloper = (email ?? "").toLowerCase() === "developer@adlrlabs.com";

  let nextClaims = existingClaims;

  if (isDeveloper) {
    await ensureDeveloperClaims(auth.uid);
    nextClaims = {
      ...(await admin.auth().getUser(auth.uid)).customClaims,
    };
  }

  return {
    updated: true,
    claims: nextClaims,
  };
});
