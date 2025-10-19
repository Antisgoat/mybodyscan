import { signInWithPopup, signInWithRedirect, type Auth, type AuthProvider } from "firebase/auth";

export async function popupThenRedirect(auth: Auth, provider: AuthProvider) {
  try {
    return await signInWithPopup(auth, provider);
  } catch (e: any) {
    const c = e?.code || "";
    if (
      c === "auth/popup-blocked" ||
      c === "auth/popup-closed-by-user" ||
      c === "auth/cancelled-popup-request"
    ) {
      console.warn("[auth] Popup failed → redirect fallback.", c);
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}
