import { isNative } from "@/lib/platform";

export async function signInWithGoogle(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Google sign-in is not available on iOS. Use email/password for now."
    );
  }
  const { webSignInGoogle } = await import("@/lib/auth/webFirebaseAuth");
  await webSignInGoogle(next);
}

export async function signInWithApple(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Apple sign-in is not available on iOS. Use email/password for now."
    );
  }
  const { webSignInApple } = await import("@/lib/auth/webFirebaseAuth");
  await webSignInApple(next);
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<
  import("firebase/auth").UserCredential | null
> {
  if (isNative()) return null;
  try {
    const { webHandleAuthRedirectResult } = await import(
      "@/lib/auth/webFirebaseAuth"
    );
    return (await webHandleAuthRedirectResult()) as any;
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
