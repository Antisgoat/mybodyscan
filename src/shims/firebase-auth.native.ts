/**
 * Native-build Firebase Auth shim.
 *
 * Hard requirements:
 * - Must NOT throw at import-time (boot safety).
 * - Must NOT import Firebase.
 * - When invoked, must fail clearly and safely.
 */

const DISABLED_MESSAGE =
  "Firebase JS Auth is disabled on native builds. Use the native auth facade.";

function disabledError() {
  const err = new Error(DISABLED_MESSAGE);
  (err as any).code = "auth/firebase-js-disabled";
  return err;
}

function rejectDisabled<T = never>(): Promise<T> {
  return Promise.reject(disabledError());
}

function throwDisabled(): never {
  throw disabledError();
}

// ---- Common functions ----
// Many of these are awaited in call-sites; prefer returning rejected Promises.
export function getAuth(): never {
  return throwDisabled();
}

export function initializeAuth(): never {
  return throwDisabled();
}

export function onAuthStateChanged(): never {
  return throwDisabled();
}

export function onIdTokenChanged(): never {
  return throwDisabled();
}

export function signInWithEmailAndPassword(): Promise<never> {
  return rejectDisabled();
}

export function createUserWithEmailAndPassword(): Promise<never> {
  return rejectDisabled();
}

export function signOut(): Promise<never> {
  return rejectDisabled();
}

export function getIdToken(): Promise<never> {
  return rejectDisabled();
}

export function signInWithPopup(): Promise<never> {
  return rejectDisabled();
}

export function signInWithRedirect(): Promise<never> {
  return rejectDisabled();
}

export function getRedirectResult(): Promise<never> {
  return rejectDisabled();
}

export function getAdditionalUserInfo(): never {
  return throwDisabled();
}

export function linkWithCredential(): Promise<never> {
  return rejectDisabled();
}

export function sendPasswordResetEmail(): Promise<never> {
  return rejectDisabled();
}

export function updateProfile(): Promise<never> {
  return rejectDisabled();
}

export function setPersistence(): Promise<never> {
  return rejectDisabled();
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
    return throwDisabled();
  }
  setCustomParameters(): never {
    return throwDisabled();
  }
}

export class OAuthProvider {
  constructor(_providerId?: string) {
    // see GoogleAuthProvider comment
  }
  addScope(): never {
    return throwDisabled();
  }
  setCustomParameters(): never {
    return throwDisabled();
  }
}

// Some codebases reference `EmailAuthProvider` directly; keep a stub to fail loudly.
export class EmailAuthProvider {
  static credential(): never {
    return throwDisabled();
  }
}

// ---- Minimal types (to satisfy TS if accidentally referenced) ----
export type Auth = unknown;
export type User = unknown;
export type UserCredential = unknown;
