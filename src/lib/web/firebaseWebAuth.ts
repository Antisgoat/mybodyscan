export type FirebaseAuthModule = never;

export function getFirebaseAuthModule(): FirebaseAuthModule {
  throw new Error("getFirebaseAuthModule moved to the web auth facade");
}
