import type { Auth } from "firebase/auth";
import { firebaseReady, getFirebaseAuth } from "./firebase";
import { signInApple, signInGoogle } from "@/lib/authFacade";

export type NormalizedAuthError = { code?: string; message: string };

export function describeAuthError(err: unknown): NormalizedAuthError {
  const code = getErrorCode(err);
  switch (code) {
    case "auth/api-key-not-valid":
      return {
        code,
        message:
          "Firebase Web API key is invalid for this project. Verify Hosting init.json and GCP restrictions.",
      };
    case "auth/internal-error":
      return {
        code,
        message:
          "Sign-in failed due to an Auth service error. Try again in a moment or contact support if it persists.",
      };
    case "auth/network-request-failed":
      return {
        code,
        message:
          "Network error contacting Auth. Check your connection and try again.",
      };
    case "auth/operation-not-allowed":
      return {
        code,
        message: "Sign-in provider is disabled in Firebase Auth.",
      };
    case "auth/popup-blocked":
      return { code, message: "Popup was blocked. Retrying via redirect…" };
    case "auth/popup-closed-by-user":
      return { code, message: "Popup was closed before completing sign-in." };
    case "auth/cancelled-popup-request":
      return {
        code,
        message: "Another popup was already open. Redirect will continue.",
      };
    case "auth/unauthorized-domain":
      return {
        code,
        message:
          "This domain isn't authorized for Firebase Auth. Add it in Firebase Console -> Auth -> Settings -> Authorized domains.",
      };
    case "auth/invalid-client":
      return {
        code,
        message:
          "Apple credentials invalid. Check Services ID, Key ID, and private key.",
      };
    case "auth/redirect-uri-mismatch":
      return {
        code,
        message:
          "Apple return URL mismatch. Add your domain(s) to the Services ID.",
      };
    case "auth/invalid-email":
      return { code, message: "That email looks invalid." };
    case "auth/user-not-found":
    case "auth/wrong-password":
      return { code, message: "Email or password is incorrect." };
    case "auth/account-exists-with-different-credential":
      return {
        code,
        message:
          "This email is already linked to a different sign-in method. Use that method, then link Google from Settings.",
      };
    default:
      return { code, message: "Sign-in failed. Please try again." };
  }
}

export async function emailPasswordSignIn(email: string, password: string) {
  try {
    await firebaseReady();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true as const };
  } catch (e) {
    const m = describeAuthError(e);
    return { ok: false as const, code: m.code, message: m.message };
  }
}

export async function googleSignIn(auth: Auth) {
  try {
    // Unified behavior:
    // - Mobile browsers (incl iOS Safari): redirect
    // - Desktop: popup with redirect fallback
    await signInGoogle();
    return { ok: true as const };
  } catch (error: unknown) {
    debugAuthFailure(error);
    const mapped = await describeAuthErrorAsync(auth, error);
    return { ok: false as const, code: mapped.code, message: mapped.message };
  }
}

export async function googleSignInWithFirebase() {
  await firebaseReady();
  const auth = await getFirebaseAuth();
  return googleSignIn(auth);
}

export async function appleSignIn() {
  await firebaseReady();
  const auth = await getFirebaseAuth();
  try {
    await signInApple();
    return { ok: true as const };
  } catch (error: unknown) {
    debugAuthFailure(error);
    const mapped = await describeAuthErrorAsync(auth, error);
    return { ok: false as const, code: mapped.code, message: mapped.message };
  }
}

export const APPLE_WEB_ENABLED = false; // keep hidden unless configured

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

function debugAuthFailure(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const code = getErrorCode(err) ?? "unknown";
  const message =
    typeof (err as { message?: string }).message === "string"
      ? (err as { message?: string }).message
      : undefined;
  const detailsCandidate =
    (err as { customData?: { details?: string } })?.customData?.details ??
    (err as { details?: string }).details;
  const payload: Record<string, unknown> = { code };
  if (message) payload.message = message;
  if (code === "auth/internal-error" && detailsCandidate) {
    payload.details = detailsCandidate;
  }
  console.debug("auth failure", payload);
}

export async function describeAuthErrorAsync(
  auth: Auth,
  error: unknown
): Promise<NormalizedAuthError> {
  const code = getErrorCode(error);
  if (code === "auth/account-exists-with-different-credential") {
    const collisionMessage = await buildAccountExistsMessage(auth, error);
    return { code, message: collisionMessage };
  }
  return describeAuthError(error);
}

async function buildAccountExistsMessage(
  auth: Auth,
  error: unknown
): Promise<string> {
  const fallback =
    "This email is already linked to a different sign-in method. Use that method, then link Google from Settings.";
  const fbError = error as NormalizedFirebaseError | undefined;
  const email = fbError?.customData?.email;
  if (!email) {
    return fallback;
  }

  try {
    const { fetchSignInMethodsForEmail } = await import("firebase/auth");
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (!Array.isArray(methods) || methods.length === 0) {
      return fallback;
    }
    const friendly = methods
      .map((method) => FRIENDLY_PROVIDER_NAMES[method] || method)
      .filter(Boolean);
    if (friendly.length === 0) {
      return fallback;
    }
    if (friendly.length === 1) {
      return `Sign in with ${friendly[0]} for ${email}, then link Google from Settings.`;
    }
    const last = friendly[friendly.length - 1];
    const rest = friendly.slice(0, -1);
    const list = `${rest.join(", ")} or ${last}`;
    return `Sign in with ${list} for ${email}, then link Google from Settings.`;
  } catch (fetchError) {
    if (import.meta.env.DEV) {
      console.warn("[auth] fetchSignInMethodsForEmail failed", fetchError);
    }
    return fallback;
  }
}

type NormalizedFirebaseError = {
  code?: string;
  customData?: {
    email?: string;
  };
};

const FRIENDLY_PROVIDER_NAMES: Record<string, string> = {
  password: "email and password",
  "google.com": "Google",
  "apple.com": "Apple",
};
