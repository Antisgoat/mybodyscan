import { signInApple, signInEmailPassword, signInGoogle } from "@/auth/client";
import { isNative } from "@/lib/platform";

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
    await signInEmailPassword(email, password);
    return { ok: true as const };
  } catch (e) {
    const m = describeAuthError(e);
    return { ok: false as const, code: m.code, message: m.message };
  }
}

export async function googleSignInWithFirebase() {
  if (isNative()) {
    return {
      ok: false as const,
      code: "auth/native-web-oauth-blocked",
      message: "Google sign-in is not available on iOS. Use email/password.",
    };
  }
  try {
    await signInGoogle();
    return { ok: true as const };
  } catch (error: unknown) {
    debugAuthFailure(error);
    const mapped = describeAuthError(error);
    return { ok: false as const, code: mapped.code, message: mapped.message };
  }
}

export async function appleSignIn() {
  if (isNative()) {
    return {
      ok: false as const,
      code: "auth/native-web-oauth-blocked",
      message: "Apple sign-in is not available on iOS. Use email/password.",
    };
  }
  try {
    await signInApple();
    return { ok: true as const };
  } catch (error: unknown) {
    debugAuthFailure(error);
    const mapped = describeAuthError(error);
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
  _auth: unknown,
  error: unknown
): Promise<NormalizedAuthError> {
  const code = getErrorCode(error);
  if (code === "auth/account-exists-with-different-credential") {
    return {
      code,
      message:
        "This email is already linked to a different sign-in method. Use that method, then link Google from Settings.",
    };
  }
  return describeAuthError(error);
}
