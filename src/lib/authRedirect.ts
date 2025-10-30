import { getRedirectResult } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { firebaseReady, getFirebaseAuth } from "./firebase";

let handled = false;

const BENIGN_ERRORS = new Set([
  "auth/no-auth-event",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
]);

export async function handleAuthRedirectOnce(): Promise<void> {
  if (handled) return;
  handled = true;

  try {
    await firebaseReady();
    const auth = getFirebaseAuth();
    await getRedirectResult(auth);
  } catch (error) {
    const code = (error as FirebaseError | undefined)?.code;
    if (code && BENIGN_ERRORS.has(code)) {
      return;
    }
    if (import.meta.env.DEV) {
      console.warn("[auth] Redirect result failed", code || error);
    }
  }
}
