import { isNative } from "@/lib/platform";
import { signInApple, signInGoogle } from "@/auth/client";

export async function signInWithGoogle(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Google sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInGoogle(next);
}

export async function signInWithApple(next?: string | null): Promise<void> {
  if (isNative()) {
    throw new Error(
      "Apple sign-in is not available on iOS. Use email/password for now."
    );
  }
  await signInApple(next);
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<any | null> {
  // Compile-time guard: in `--mode native` we must not even bundle the web impl.
  if (__NATIVE__) return null;
  if (isNative()) return null;
  try {
    const { finalizeRedirectResult } = await import("@/auth/webAuth");
    return await finalizeRedirectResult();
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
