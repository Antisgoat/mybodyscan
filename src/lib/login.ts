import { auth } from "./firebase";
import { popupThenRedirect } from "./popupAuth";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  type UserCredential,
} from "firebase/auth";
import { SHOW_APPLE_WEB } from "./flags";

export type LoginResult = { ok: true } | { ok: false; code?: string; message?: string };

export const APPLE_WEB_ENABLED = SHOW_APPLE_WEB;

export async function emailPasswordSignIn(email: string, password: string): Promise<LoginResult> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (err) {
    const { code, message } = mapAuthError(err);
    return { ok: false, code, message };
  }
}

export async function googleSignIn(): Promise<LoginResult> {
  try {
    const provider = new GoogleAuthProvider();
    const cred: UserCredential | undefined = await popupThenRedirect(auth, provider);
    // If undefined, redirect has begun; treat as success to avoid duplicate toasts.
    return { ok: true };
  } catch (err) {
    const { code, message } = mapAuthError(err);
    return { ok: false, code, message };
  }
}

export async function appleSignIn(): Promise<LoginResult> {
  try {
    const provider = new OAuthProvider("apple.com");
    // Request basic scopes if Apple is enabled on web
    provider.addScope("email");
    provider.addScope("name");
    const cred: UserCredential | undefined = await popupThenRedirect(auth, provider);
    return { ok: true };
  } catch (err) {
    const { code, message } = mapAuthError(err);
    return { ok: false, code, message };
  }
}

function mapAuthError(err: unknown): { code?: string; message: string } {
  const code = getErrorCode(err);
  switch (code) {
    case "auth/operation-not-allowed":
      return { code, message: "Sign-in provider is disabled in Firebase Auth." };
    case "auth/invalid-client":
      return { code, message: "Apple credentials invalid. Check Services ID, Key ID, and private key." };
    case "auth/redirect-uri-mismatch":
      return { code, message: "Apple return URL mismatch. Add your domain to the Apple Services ID." };
    case "auth/popup-blocked":
      return { code, message: "Popup was blocked. Retrying via redirect…" };
    case "auth/popup-closed-by-user":
      return { code, message: "Popup was closed before completing sign-in." };
    case "auth/cancelled-popup-request":
      return { code, message: "Another popup was already open. Redirect fallback will continue." };
    case "auth/invalid-email":
      return { code, message: "That email looks invalid. Please check and try again." };
    case "auth/user-disabled":
      return { code, message: "This account is disabled." };
    case "auth/user-not-found":
    case "auth/wrong-password":
      return { code, message: "Email or password is incorrect." };
    default:
      return { code, message: "Sign-in failed. Please try again." };
  }
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in (err as any)) {
    return String((err as any).code || "").trim();
  }
  return undefined;
}
