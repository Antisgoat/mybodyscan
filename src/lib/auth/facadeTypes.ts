import type { AuthState, AuthUser, Unsubscribe } from "@/lib/auth/types";

export type AuthFacade = {
  signInGoogle(next?: string | null): Promise<void>;
  signInApple(next?: string | null): Promise<void>;
  signInEmail(email: string, password: string): Promise<AuthUser | null>;
  createUserEmail(email: string, password: string): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  sendPasswordResetEmail(email: string): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  getIdToken(options?: { forceRefresh?: boolean }): Promise<string | null>;
  onAuthStateChanged(cb: (state: AuthState) => void): Promise<Unsubscribe>;
  onIdTokenChanged(cb: (token: string | null) => void): Promise<Unsubscribe>;
};

