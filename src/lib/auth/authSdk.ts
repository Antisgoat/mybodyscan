/**
 * Lazy loader for the Firebase Auth JS SDK.
 *
 * CRITICAL: Do not statically import from `firebase/auth` anywhere in the app.
 * Keep all Auth SDK access behind `await loadAuthSdk()` so native (WKWebView)
 * boot can avoid executing Firebase Auth code until it is actually needed.
 */

type FirebaseAuthModule = typeof import("firebase/auth");

let cached: Promise<FirebaseAuthModule> | null = null;

export async function loadAuthSdk(): Promise<FirebaseAuthModule> {
  // Native hard block: never import/execute Firebase JS Auth in WKWebView.
  // Native auth must go through the Capacitor plugin layer and must be invoked
  // only on explicit user actions.
  try {
    const { isNative } = await import("@/lib/platform");
    if (isNative()) {
      const err = new Error("Firebase JS Auth is disabled on native builds");
      (err as any).code = "auth/native-js-auth-disabled";
      throw err;
    }
  } catch {
    // If platform detection fails, fall through (web) rather than crashing import-time.
  }
  if (!cached) {
    cached = import("firebase/auth");
  }
  return cached;
}

