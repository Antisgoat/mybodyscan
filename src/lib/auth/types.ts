export type Unsubscribe = () => void;

/**
 * Minimal cross-platform user shape used by the app.
 * - Web: derived from Firebase JS SDK `User`
 * - Native: derived from the native Firebase auth plugin user payload
 *
 * IMPORTANT: This intentionally does NOT expose Firebase JS SDK methods like `getIdToken()`
 * so native code never needs to import/execute Firebase Auth.
 */
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

export type AuthState = {
  user: AuthUser | null;
};
