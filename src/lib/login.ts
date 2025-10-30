import type { Auth } from "firebase/auth";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { popupThenRedirect } from "./popupThenRedirect";
import { firebaseReady, getFirebaseAuth } from "./firebase";
import { isCapacitor, isIOSWebView, isInAppBrowser } from "./platform";
import { toast } from "./toast";

function mapAuthError(err: unknown): { code?: string; message: string } {
  const code = (err && typeof err === "object" && "code" in (err as any)) ? String((err as any).code) : undefined;
  switch (code) {
    case "auth/api-key-not-valid":
      return { code, message: "Firebase Web API key is invalid for this project. Verify Hosting init.json and GCP restrictions." };
    case "auth/internal-error":
      return { code, message: "Auth service returned an internal error. Ensure Identity Toolkit is enabled for this project." };
    case "auth/network-request-failed":
      return { code, message: "Network error contacting Auth. Check your connection and try again." };
    case "auth/operation-not-allowed":
      return { code, message: "Sign-in provider is disabled in Firebase Auth." };
    case "auth/popup-blocked":
      return { code, message: "Popup was blocked. Retrying via redirect…" };
    case "auth/popup-closed-by-user":
      return { code, message: "Popup was closed before completing sign-in." };
    case "auth/cancelled-popup-request":
      return { code, message: "Another popup was already open. Redirect will continue." };
    case "auth/invalid-client":
      return { code, message: "Apple credentials invalid. Check Services ID, Key ID, and private key." };
    case "auth/redirect-uri-mismatch":
      return { code, message: "Apple return URL mismatch. Add your domain(s) to the Services ID." };
    case "auth/invalid-email":
      return { code, message: "That email looks invalid." };
    case "auth/user-not-found":
    case "auth/wrong-password":
      return { code, message: "Email or password is incorrect." };
    default:
      return { code, message: "Sign-in failed. Please try again." };
  }
}

export async function emailPasswordSignIn(email: string, password: string) {
  try {
    await firebaseReady();
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true as const };
  } catch (e) {
    const m = mapAuthError(e);
    return { ok: false as const, code: m.code, message: m.message };
  }
}

export async function googleSignIn(auth: Auth) {
  const provider = new GoogleAuthProvider();

  const redirect = async () => {
    try {
      await signInWithRedirect(auth, provider);
      return { ok: true as const };
    } catch (error) {
      const mapped = mapAuthError(error);
      return { ok: false as const, code: mapped.code, message: mapped.message };
    }
  };

  const constrainedWebView = isIOSWebView() || isCapacitor() || isInAppBrowser();
  if (constrainedWebView) {
    if (import.meta.env.DEV) {
      toast("Using redirect for Google sign-in (WebView detected).");
    }
    return redirect();
  }

  try {
    await signInWithPopup(auth, provider);
    return { ok: true as const };
  } catch (error: unknown) {
    const code = getErrorCode(error);
    if (
      code === "auth/operation-not-supported-in-this-environment" ||
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/internal-error" ||
      !code
    ) {
      return redirect();
    }

    const mapped = mapAuthError(error);
    return { ok: false as const, code: mapped.code, message: mapped.message };
  }
}

export async function googleSignInWithFirebase() {
  await firebaseReady();
  const auth = getFirebaseAuth();
  return googleSignIn(auth);
}

function getErrorCode(err: unknown): string | undefined {
  if (
    err &&
    typeof err === "object" &&
    "code" in (err as Record<string, unknown>) &&
    typeof (err as Record<string, unknown>).code === "string"
  ) {
    return (err as Record<string, unknown>).code as string;
  }
  return undefined;
}

export async function appleSignIn() {
  try {
    await firebaseReady();
    const auth = getFirebaseAuth();
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    await popupThenRedirect(auth, provider);
    return { ok: true as const };
  } catch (e) {
    const m = mapAuthError(e);
    return { ok: false as const, code: m.code, message: m.message };
  }
}

export const APPLE_WEB_ENABLED = false; // keep hidden unless configured
