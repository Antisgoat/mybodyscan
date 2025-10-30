import type { FirebaseError } from "firebase/app";
import {
  getAdditionalUserInfo,
  getRedirectResult,
  type UserCredential,
  updateProfile,
} from "firebase/auth";
import { firebaseReady, getFirebaseAuth } from "./firebase";

const BENIGN_ERRORS = new Set([
  "auth/no-auth-event",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
]);

type AuthRedirectOutcome = {
  result: UserCredential | null;
  error: FirebaseError | null;
};

let handled = false;
let outcomePromise: Promise<AuthRedirectOutcome> | null = null;
let cachedOutcome: AuthRedirectOutcome | null = null;
let resultConsumed = false;
let errorConsumed = false;

async function resolveRedirect(): Promise<AuthRedirectOutcome> {
  try {
    await firebaseReady();
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (result) {
      await maybeApplyAppleProfile(result);
    }
    const outcome: AuthRedirectOutcome = { result: result ?? null, error: null };
    cachedOutcome = outcome;
    return outcome;
  } catch (error) {
    const fbError = (error as FirebaseError) ?? null;
    if (fbError?.code && BENIGN_ERRORS.has(fbError.code)) {
      const outcome: AuthRedirectOutcome = { result: null, error: null };
      cachedOutcome = outcome;
      return outcome;
    }
    if (import.meta.env.DEV) {
      console.warn("[auth] Redirect result failed", fbError?.code || error);
    }
    const outcome: AuthRedirectOutcome = { result: null, error: fbError };
    cachedOutcome = outcome;
    return outcome;
  }
}

export function handleAuthRedirectOnce(): Promise<AuthRedirectOutcome> {
  if (handled && outcomePromise) {
    return outcomePromise;
  }
  if (!outcomePromise) {
    outcomePromise = resolveRedirect().finally(() => {
      handled = true;
    });
  }
  return outcomePromise;
}

export async function consumeAuthRedirectResult(): Promise<UserCredential | null> {
  const outcome = await handleAuthRedirectOnce();
  if (resultConsumed) {
    return null;
  }
  resultConsumed = true;
  return outcome.result;
}

export async function consumeAuthRedirectError(): Promise<FirebaseError | null> {
  const outcome = await handleAuthRedirectOnce();
  if (errorConsumed) {
    return null;
  }
  errorConsumed = true;
  return outcome.error;
}

export function peekAuthRedirectOutcome(): AuthRedirectOutcome | null {
  return cachedOutcome;
}

const APPLE_PROVIDER_ID = "apple.com";

type AppleAdditionalProfile = {
  name?: { firstName?: string; lastName?: string };
  firstName?: string;
  lastName?: string;
};

async function maybeApplyAppleProfile(result: UserCredential | null) {
  if (!result) return;
  const info = getAdditionalUserInfo(result);
  if (info?.providerId !== APPLE_PROVIDER_ID) return;
  if (!info.isNewUser || !result.user || result.user.displayName) return;
  const profile = info.profile as AppleAdditionalProfile | undefined;
  const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
  const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
  const displayName = `${firstName} ${lastName}`.trim();
  if (displayName) {
    try {
      await updateProfile(result.user, { displayName });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[auth] Failed to populate Apple display name", error);
      }
    }
  }
}
