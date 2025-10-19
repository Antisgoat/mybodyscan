import { signInWithPopup, signInWithRedirect, type Auth, type AuthProvider, type UserCredential } from "firebase/auth";

export async function popupThenRedirect(auth: Auth, provider: AuthProvider): Promise<UserCredential | void> {
  try {
    return await signInWithPopup(auth, provider);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const popupIssue =
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment";
    if (popupIssue) {
      console.warn("[auth] Popup blocked/closed; falling back to redirect.", error);
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}
