/**
 * Native-build Firebase Auth shim.
 *
 * This module must be used ONLY for Vite `--mode native` via `resolve.alias`.
 * If it is imported at runtime, it will throw a clear error instead of
 * letting Firebase JS Auth crash WKWebView at boot.
 */

const DISABLED_MESSAGE =
  "Firebase JS Auth is disabled on native builds. Use the native auth facade.";

function disabled(): never {
  throw new Error(DISABLED_MESSAGE);
}

// ---- Common functions ----
export function getAuth(): never {
  return disabled();
}

export function initializeAuth(): never {
  return disabled();
}

export function onAuthStateChanged(): never {
  return disabled();
}

export function signInWithEmailAndPassword(): never {
  return disabled();
}

export function createUserWithEmailAndPassword(): never {
  return disabled();
}

export function signOut(): never {
  return disabled();
}

export function getIdToken(): never {
  return disabled();
}

export function signInWithPopup(): never {
  return disabled();
}

export function signInWithRedirect(): never {
  return disabled();
}

export function getRedirectResult(): never {
  return disabled();
}

export function getAdditionalUserInfo(): never {
  return disabled();
}

export function linkWithCredential(): never {
  return disabled();
}

export function onIdTokenChanged(): never {
  return disabled();
}

export function sendPasswordResetEmail(): never {
  return disabled();
}

export function updateProfile(): never {
  return disabled();
}

export function setPersistence(): never {
  return disabled();
}

// ---- Persistence placeholders ----
export const inMemoryPersistence: any = {
  __native_disabled: true,
  toString: () => "inMemoryPersistence(native-disabled)",
};
export const indexedDBLocalPersistence: any = {
  __native_disabled: true,
  toString: () => "indexedDBLocalPersistence(native-disabled)",
};
export const browserLocalPersistence: any = {
  __native_disabled: true,
  toString: () => "browserLocalPersistence(native-disabled)",
};
export const browserSessionPersistence: any = {
  __native_disabled: true,
  toString: () => "browserSessionPersistence(native-disabled)",
};

// ---- Provider placeholders ----
export class GoogleAuthProvider {
  constructor() {
    // Allow construction so incidental type checks don't explode,
    // but fail on any actual usage.
  }
  addScope(): never {
    return disabled();
  }
  setCustomParameters(): never {
    return disabled();
  }
}

export class OAuthProvider {
  constructor(_providerId?: string) {
    // see GoogleAuthProvider comment
  }
  addScope(): never {
    return disabled();
  }
  setCustomParameters(): never {
    return disabled();
  }
}

// Some codebases reference `EmailAuthProvider` directly; keep a stub to fail loudly.
export class EmailAuthProvider {
  static credential(): never {
    return disabled();
  }
}

// ---- Minimal types (to satisfy TS if accidentally referenced) ----
export type Auth = unknown;
export type User = unknown;
export type UserCredential = unknown;
