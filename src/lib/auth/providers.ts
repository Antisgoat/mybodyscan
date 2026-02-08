import { isCapacitorNative } from "@/lib/platform/isNative";
import { signInApple, signInGoogle } from "@/auth/mbs-auth";

export async function signInWithGoogle(next?: string | null): Promise<void> {
  if (isCapacitorNative()) {
    throw new Error(
      "Google sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInGoogle(next);
}

export async function signInWithApple(next?: string | null): Promise<void> {
  if (isCapacitorNative()) {
    throw new Error(
      "Apple sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInApple(next);
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<any | null> {
  if (isCapacitorNative()) return null;
  try {
    const { finalizeRedirectResult } = await import("@/auth/webAuth");
    return await finalizeRedirectResult();
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
