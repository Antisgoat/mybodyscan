/**
 * Native-build Firebase Auth shim.
 *
 * This module must be used ONLY for Vite `--mode native` via `resolve.alias`.
 * If it is imported at runtime, it will throw a clear error instead of
 * letting Firebase JS Auth crash WKWebView at boot.
 */

const DISABLED_MESSAGE =
  "Firebase JS Auth is disabled on native builds. Use src/auth/facade (native plugin).";

function disabled(name: string): never {
  const err = new Error(`${DISABLED_MESSAGE} (attempted: ${name})`);
  (err as any).code = "auth/firebase-js-disabled";
  throw err;
}

// ---- Common functions ----
export function getAuth(): never {
  return disabled("getAuth");
}

export function initializeAuth(): never {
  return disabled("initializeAuth");
}

export function onAuthStateChanged(): never {
  return disabled("onAuthStateChanged");
}

export function signInWithEmailAndPassword(): never {
  return disabled("signInWithEmailAndPassword");
}

export function createUserWithEmailAndPassword(): never {
  return disabled("createUserWithEmailAndPassword");
}

export function signOut(): never {
  return disabled("signOut");
}

export function getIdToken(): never {
  return disabled("getIdToken");
}

export function signInWithPopup(): never {
  return disabled("signInWithPopup");
}

export function signInWithRedirect(): never {
  return disabled("signInWithRedirect");
}

export function getRedirectResult(): never {
  return disabled("getRedirectResult");
}

export function getAdditionalUserInfo(): never {
  return disabled("getAdditionalUserInfo");
}

export function linkWithCredential(): never {
  return disabled("linkWithCredential");
}

export function onIdTokenChanged(): never {
  return disabled("onIdTokenChanged");
}

export function sendPasswordResetEmail(): never {
  return disabled("sendPasswordResetEmail");
}

export function updateProfile(): never {
  return disabled("updateProfile");
}

export function setPersistence(): never {
  return disabled("setPersistence");
}

// ---- Persistence placeholders ----
export const inMemoryPersistence: unknown = {
  __native_disabled: true,
  toString: () => "inMemoryPersistence(native-disabled)",
};
export const indexedDBLocalPersistence: unknown = {
  __native_disabled: true,
  toString: () => "indexedDBLocalPersistence(native-disabled)",
};
export const browserLocalPersistence: unknown = {
  __native_disabled: true,
  toString: () => "browserLocalPersistence(native-disabled)",
};
export const browserSessionPersistence: unknown = {
  __native_disabled: true,
  toString: () => "browserSessionPersistence(native-disabled)",
};

// ---- Provider placeholders ----
export class GoogleAuthProvider {
  constructor() {
    disabled("new GoogleAuthProvider()");
  }
}

export class OAuthProvider {
  constructor() {
    disabled("new OAuthProvider()");
  }
}

// Some codebases reference `EmailAuthProvider` directly; keep a stub to fail loudly.
export class EmailAuthProvider {
  static credential(): never {
    return disabled("EmailAuthProvider.credential");
  }
}

// ---- Minimal types (to satisfy TS if accidentally referenced) ----
export type Auth = unknown;
export type User = unknown;
export type UserCredential = unknown;
