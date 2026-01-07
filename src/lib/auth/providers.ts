import { isNative } from "@/lib/platform";
import { signInWithApple, signInWithGoogle } from "@/auth/facade";

export async function signInWithGoogle(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Google sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInWithGoogle(next);
}

export async function signInWithApple(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Apple sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInWithApple(next);
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<any | null> {
  if (isNative()) return null;
  try {
    const { finalizeRedirectResult } = await import("@/auth/impl.web");
    return await finalizeRedirectResult();
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
