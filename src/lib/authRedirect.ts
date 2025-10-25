import { getRedirectResult } from "firebase/auth";
import { firebaseReady, getFirebaseAuth } from "./firebase";
import { toast } from "./toast";

function mapError(code: string | undefined): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Sign-in provider is disabled in Firebase Auth.";
    case "auth/invalid-client":
      return "Apple credentials invalid. Check Services ID, Key ID, private key.";
    case "auth/redirect-uri-mismatch":
      return "Apple return URL mismatch. Add your domain to the Apple Services ID.";
    case "auth/popup-blocked":
      return "Popup was blocked. Falling back to redirect…";
    case "auth/popup-closed-by-user":
      return "Popup was closed before completing sign-in.";
    case "auth/cancelled-popup-request":
      return "Another popup was already open. Redirect continues.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

(async () => {
  if (typeof window === "undefined") return;
  try {
    await firebaseReady();
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    void result;
  } catch (err: any) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
    toast(mapError(code), "error");
    // eslint-disable-next-line no-console
    console.warn("[auth] redirect error:", err);
  }
})();
