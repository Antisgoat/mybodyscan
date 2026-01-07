import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { reportError } from "@/lib/telemetry";
import { setDoc, updateDoc } from "@/lib/dbWrite";

import type { AuthUser } from "@/lib/auth/types";

type UpsertUserFields = {
  createdAt?: unknown;
  lastLoginAt: unknown;
  email?: string;
  displayName?: string;
};

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Non-blocking user doc upsert:
 * - Updates lastLoginAt on every sign-in
 * - Sets createdAt only when the doc doesn't exist yet
 * - Adds email/displayName when present (never overwrites with empty)
 */
export async function upsertUserRootProfile(user: AuthUser): Promise<void> {
  if (!user?.uid) return;
  const ref = doc(db, "users", user.uid);
  const email = cleanString(user.email);
  const displayName = cleanString(user.displayName);

  const updatePayload: Partial<UpsertUserFields> = {
    lastLoginAt: serverTimestamp(),
    ...(email ? { email } : null),
    ...(displayName ? { displayName } : null),
  };

  try {
    await updateDoc(ref as any, updatePayload as any);
    return;
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : undefined;
    // Most common case: doc doesn't exist yet.
    if (code !== "not-found" && code !== "firestore/not-found") {
      void reportError({
        kind: "auth_profile_upsert_update_failed",
        message: error?.message || "User profile update failed",
        code,
        extra: { uid: user.uid },
      });
    }
  }

  const createPayload: UpsertUserFields = {
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    ...(email ? { email } : null),
    ...(displayName ? { displayName } : null),
  };

  try {
    await setDoc(ref as any, createPayload as any, { merge: true });
  } catch (error: any) {
    void reportError({
      kind: "auth_profile_upsert_set_failed",
      message: error?.message || "User profile write failed",
      code: typeof error?.code === "string" ? error.code : undefined,
      extra: { uid: user.uid },
    });
    throw error;
  }
}

