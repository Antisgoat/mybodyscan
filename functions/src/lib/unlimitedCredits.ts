import { getFirestore } from "../firebase.js";

const db = getFirestore();

/**
 * Firestore mirror for immediate unlimited enforcement.
 *
 * Source of truth for the mirror is `users/{uid}/private/admin.unlimitedCredits`
 * (also mirrored to `users/{uid}.unlimitedCredits` for UI convenience).
 */
export async function hasUnlimitedCreditsMirror(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await db.doc(`users/${uid}/private/admin`).get();
    return (snap.data() as any)?.unlimitedCredits === true;
  } catch {
    return false;
  }
}

