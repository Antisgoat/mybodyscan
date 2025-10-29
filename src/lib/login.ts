import type { Auth } from "firebase/auth";
import { GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, signInWithRedirect } from "firebase/auth";
import { popupThenRedirect } from "./popupThenRedirect";
import { firebaseReady, getFirebaseAuth } from "./firebase";

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
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isIOS && isSafari) {
    // Safari/iOS blocks popups and 3P cookies → go redirect-first
    await signInWithRedirect(auth, provider);
    return { ok: true };
  }
  try {
    await popupThenRedirect(auth, provider);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, code: e?.code || "auth/unknown", message: e?.message || "Sign-in failed" };
  }
}

export async function googleSignInWithFirebase() {
  await firebaseReady();
  const auth = getFirebaseAuth();
  return googleSignIn(auth);
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
