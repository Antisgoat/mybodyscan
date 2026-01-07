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
  if (!cached) {
    cached = import("firebase/auth");
  }
  return cached;
}

