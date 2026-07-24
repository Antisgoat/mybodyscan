import { registerPlugin } from "@capacitor/core";
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword as webCreateUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged as webOnAuthStateChanged,
  onIdTokenChanged as webOnIdTokenChanged,
  sendPasswordResetEmail as webSendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword as webSignInWithEmailAndPassword,
  signOut as webSignOut,
  type Auth,
  type User,
} from "firebase/auth";

import { firebaseApp } from "@/lib/firebase";
import type { MbsUser, MbsUserCredential, Unsubscribe } from "./mbs-auth.types";

type NativeOAuthCredential = {
  accessToken?: string;
  idToken?: string;
  nonce?: string;
  providerId?: string;
};

type NativeOAuthResult = {
  credential: NativeOAuthCredential | null;
};

type NativeFirebaseAuthenticationPlugin = {
  signOut(): Promise<void>;
  signInWithGoogle(options?: {
    skipNativeAuth?: boolean;
    useCredentialManager?: boolean;
  }): Promise<NativeOAuthResult>;
  signInWithApple(options?: {
    skipNativeAuth?: boolean;
  }): Promise<NativeOAuthResult>;
};

// The native bridge owns the secure Google/Apple provider UI. Firebase JS Auth
// remains the canonical session because Firestore, Storage, and callable
// Functions are Firebase JS clients inside the Capacitor shell.
const FirebaseAuthentication =
  registerPlugin<NativeFirebaseAuthenticationPlugin>(
    "FirebaseAuthentication"
  );

function initializeNativeWebAuth(): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: indexedDBLocalPersistence,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (
      code === "auth/already-initialized" ||
      message.includes("already-initialized")
    ) {
      return getAuth(firebaseApp);
    }
    throw error;
  }
}

const auth = initializeNativeWebAuth();

function toMbsUser(user?: User | null): MbsUser | null {
  if (!user?.uid) return null;
  const providerId =
    user.providerData.find((provider) => provider.providerId)?.providerId ??
    user.providerId ??
    null;
  return {
    uid: String(user.uid),
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    phoneNumber: user.phoneNumber ?? null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId,
  };
}

function requireWebUser(user: User | null, operation: string): MbsUserCredential {
  const normalized = toMbsUser(user);
  if (!normalized) {
    const error: Error & { code?: string } = new Error(
      `${operation} did not establish a Firebase web session.`
    );
    error.code = "auth/native-web-session-missing";
    throw error;
  }
  return { user: normalized };
}

function requireCredentialToken(
  value: string | undefined,
  operation: string,
  field: string
): string {
  if (value) return value;
  const error: Error & { code?: string } = new Error(
    `${operation} did not return the required ${field}.`
  );
  error.code = "auth/native-credential-missing";
  throw error;
}

export async function getCurrentUser(): Promise<MbsUser | null> {
  return toMbsUser(auth.currentUser);
}

export async function getIdToken(
  forceRefresh?: boolean | { forceRefresh?: boolean }
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const shouldRefresh =
    typeof forceRefresh === "object"
      ? Boolean(forceRefresh.forceRefresh)
      : Boolean(forceRefresh);
  try {
    return await user.getIdToken(shouldRefresh);
  } catch {
    return null;
  }
}

export async function onAuthStateChanged(
  callback: (user: MbsUser | null) => void
): Promise<Unsubscribe> {
  return webOnAuthStateChanged(auth, (user) => callback(toMbsUser(user)));
}

export async function onIdTokenChanged(
  callback: (token: string | null) => void
): Promise<Unsubscribe> {
  return webOnIdTokenChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    try {
      callback(await user.getIdToken());
    } catch {
      callback(null);
    }
  });
}

export async function signOut(): Promise<void> {
  // The Firebase JS session is canonical for Firestore, Storage, and callable
  // authorization, so a failure to clear it must reach the caller.
  await webSignOut(auth);
  // Native provider cleanup is best effort after the canonical session ends.
  await FirebaseAuthentication.signOut().catch(() => undefined);
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const result = await webSignInWithEmailAndPassword(auth, email, password);
  return requireWebUser(result.user, "Native email sign-in");
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const result = await webCreateUserWithEmailAndPassword(auth, email, password);
  return requireWebUser(result.user, "Native account creation");
}

export async function createAccountEmail(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  return createUserWithEmailAndPassword(email, password);
}

export async function signInEmailPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  return signInWithEmailAndPassword(email, password);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await webSendPasswordResetEmail(auth, email);
}

export async function signInWithGoogle(): Promise<void> {
  const result = await FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
    useCredentialManager: true,
  });
  const idToken = requireCredentialToken(
    result.credential?.idToken,
    "Native Google sign-in",
    "ID token"
  );
  const credential = GoogleAuthProvider.credential(
    idToken,
    result.credential?.accessToken
  );
  const webResult = await signInWithCredential(auth, credential);
  requireWebUser(webResult.user, "Native Google sign-in");
}

export async function signInWithApple(): Promise<void> {
  const result = await FirebaseAuthentication.signInWithApple({
    skipNativeAuth: true,
  });
  const idToken = requireCredentialToken(
    result.credential?.idToken,
    "Native Apple sign-in",
    "ID token"
  );
  const rawNonce = requireCredentialToken(
    result.credential?.nonce,
    "Native Apple sign-in",
    "nonce"
  );
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken, rawNonce });
  const webResult = await signInWithCredential(auth, credential);
  requireWebUser(webResult.user, "Native Apple sign-in");
}

export async function webRequireAuth(): Promise<null> {
  return null;
}
