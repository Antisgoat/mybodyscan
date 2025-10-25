import {
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type AuthProvider,
  type UserCredential,
} from "firebase/auth";

/**
 * Attempt popup sign-in; on common popup failures, fall back to redirect.
 * Returns the UserCredential on popup success, or undefined after initiating redirect.
 * Throws for non-popup errors.
 */
export async function popupThenRedirect(
  auth: Auth,
  provider: AuthProvider,
): Promise<UserCredential | undefined> {
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred;
  } catch (err) {
    const code = getErrorCode(err);
    if (
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/popup-closed-by-user"
    ) {
      // Start redirect flow; control returns after page reload.
      await signInWithRedirect(auth, provider);
      return;
    }

    // Non-popup-related auth error; rethrow for caller to handle.
    throw err;
  }
}

function getErrorCode(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "code" in (err as Record<string, unknown>) &&
    typeof (err as Record<string, unknown>).code === "string"
  ) {
    return (err as Record<string, unknown>).code as string;
  }

  return "";
}
