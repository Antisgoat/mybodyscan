import { signInWithPopup, signInWithRedirect, type Auth, type AuthProvider } from "firebase/auth";

export async function popupThenRedirect(auth: Auth, provider: AuthProvider) {
  try {
    return await signInWithPopup(auth, provider);
  } catch (e: any) {
    const code = e?.code || "";
    const popupIssue =
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request";
    if (popupIssue) {
      console.warn("[auth] Popup blocked/closed → redirect fallback.", e);
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}
