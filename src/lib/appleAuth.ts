import {
  getAuth,
  getAdditionalUserInfo,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
  updateProfile,
} from "firebase/auth";
import { isNative } from "@/lib/platform";

export const APPLE_PROVIDER_ID = "apple.com";

type AppleSignInSuccess =
  | { ok: true; flow: "redirect"; credential: null }
  | { ok: true; flow: "popup"; credential: UserCredential };

type AppleSignInFailure = { ok: false; code?: string; message: string };

export type AppleSignInResult = AppleSignInSuccess | AppleSignInFailure;

async function applyAppleProfile(result: UserCredential | null) {
  if (!result) return;

  const info = getAdditionalUserInfo(result);
  if (!info || info.providerId !== APPLE_PROVIDER_ID) return;
  if (!info.isNewUser || !result.user || result.user.displayName) return;

  const profile = info.profile as
    | { name?: { firstName?: string; lastName?: string }; firstName?: string; lastName?: string }
    | undefined;

  const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
  const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
  const displayName = `${firstName} ${lastName}`.trim();

  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  const auth = getAuth();
  const provider = new OAuthProvider(APPLE_PROVIDER_ID);
  provider.addScope("email");
  provider.addScope("name");

  try {
    if (isNative) {
      await signInWithRedirect(auth, provider);
      return { ok: true, flow: "redirect", credential: null };
    }

    const credential = await signInWithPopup(auth, provider);
    await applyAppleProfile(credential);
    return { ok: true, flow: "popup", credential };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : undefined;
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "Sign in with Apple failed.";

    return { ok: false, code, message };
  }
}

export async function applyAppleRedirectProfile(result: UserCredential | null) {
  await applyAppleProfile(result);
}
