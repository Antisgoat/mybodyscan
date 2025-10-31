import type { FirebaseError } from "firebase/app";
import {
  getAdditionalUserInfo,
  getRedirectResult,
  type UserCredential,
  updateProfile,
  type Auth,
} from "firebase/auth";
import { firebaseReady, getFirebaseAuth } from "./firebase";
import { describeAuthErrorAsync, type NormalizedAuthError } from "./login";

const BENIGN_ERRORS = new Set([
  "auth/no-auth-event",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
]);

type AuthRedirectOutcome = {
  result: UserCredential | null;
  error: FirebaseError | null;
  normalizedError: NormalizedAuthError | null;
};

export type FriendlyFirebaseError = FirebaseError & {
  friendlyMessage?: string | null;
  friendlyCode?: string | null;
};

let handled = false;
let outcomePromise: Promise<AuthRedirectOutcome> | null = null;
let cachedOutcome: AuthRedirectOutcome | null = null;
let resultConsumed = false;
let errorConsumed = false;

async function resolveRedirect(): Promise<AuthRedirectOutcome> {
  let auth: Auth | null = null;
  try {
    await firebaseReady();
    auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (result) {
      await maybeApplyAppleProfile(result);
    }
    const outcome: AuthRedirectOutcome = { result: result ?? null, error: null, normalizedError: null };
    cachedOutcome = outcome;
    return outcome;
  } catch (error) {
    const fbError = (error as FirebaseError) ?? null;
    if (fbError?.code && BENIGN_ERRORS.has(fbError.code)) {
      const outcome: AuthRedirectOutcome = { result: null, error: null, normalizedError: null };
      cachedOutcome = outcome;
      return outcome;
    }
    if (import.meta.env.DEV) {
      console.warn("[auth] Redirect result failed", fbError?.code || error);
    }

    let normalized: NormalizedAuthError | null = null;
    if (fbError) {
      try {
        auth ??= getFirebaseAuth();
        normalized = await describeAuthErrorAsync(auth, fbError);
      } catch (normalizeError) {
        if (import.meta.env.DEV) {
          console.warn("[auth] Redirect error normalization failed", normalizeError);
        }
      }
    }

    const outcome: AuthRedirectOutcome = { result: null, error: fbError, normalizedError: normalized };
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

export async function consumeAuthRedirectError(): Promise<FriendlyFirebaseError | null> {
  const outcome = await handleAuthRedirectOnce();
  if (errorConsumed) {
    return null;
  }
  errorConsumed = true;
  if (!outcome.error) {
    return null;
  }
  const enriched = outcome.error as FriendlyFirebaseError;
  if (outcome.normalizedError) {
    enriched.friendlyMessage = outcome.normalizedError.message ?? null;
    enriched.friendlyCode = outcome.normalizedError.code ?? outcome.error.code ?? null;
  } else {
    enriched.friendlyMessage ??= null;
    enriched.friendlyCode ??= outcome.error.code ?? null;
  }
  return enriched;
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
