import type { UserCredential } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { isNative } from "@/lib/platform";

export async function signInWithGoogle(next?: string | null): Promise<void> {
  const { signInWithOAuthProvider } = await import("@/lib/auth/oauth");
  const { GoogleAuthProvider } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  // Keep scopes explicit for parity with Apple
  provider.addScope("email");
  provider.addScope("profile");
  await signInWithOAuthProvider({ providerId: "google.com", provider, next });
}

export async function signInWithApple(next?: string | null): Promise<void> {
  const { signInWithOAuthProvider } = await import("@/lib/auth/oauth");
  const { OAuthProvider } = await import("firebase/auth");
  const provider = new OAuthProvider("apple.com");
  // Request user name & email on first sign-in; Apple may provide them once.
  provider.addScope("email");
  provider.addScope("name");
  // Optional custom parameters:
  // provider.setCustomParameters({ locale: "en_US" });
  await signInWithOAuthProvider({ providerId: "apple.com", provider, next });
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<UserCredential | null> {
  if (isNative()) return null;
  try {
    const { getRedirectResult } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const cred = await getRedirectResult(auth);
    return cred; // may be null if no redirect pending
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
