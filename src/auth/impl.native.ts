import type { AuthImpl } from "./facade";
import type { Unsubscribe, UserLike } from "./types";

import { FirebaseAuthentication } from "@/native/firebaseAuthentication";

let cachedUser: UserLike | null = null;
let listenerAttached = false;

function toUserLike(user: any | null | undefined): UserLike | null {
  if (!user) return null;
  return {
    uid: String(user.uid ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoUrl: typeof user.photoUrl === "string" ? user.photoUrl : null,
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId: typeof user.providerId === "string" ? user.providerId : null,
  };
}

async function refreshCurrentUser(): Promise<UserLike | null> {
  try {
    const res = await FirebaseAuthentication.getCurrentUser();
    cachedUser = toUserLike(res?.user);
    return cachedUser;
  } catch {
    cachedUser = null;
    return null;
  }
}

async function attachListenerIfAvailable(): Promise<void> {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    if (typeof FirebaseAuthentication?.addListener !== "function") return;
    await FirebaseAuthentication.addListener("authStateChange", (change: any) => {
      cachedUser = toUserLike(change?.user);
    });
  } catch {
    // ignore
  }
}

export const impl: AuthImpl = {
  async getCurrentUser() {
    await attachListenerIfAvailable();
    if (cachedUser) return cachedUser;
    return refreshCurrentUser();
  },

  async getIdToken(forceRefresh?: boolean) {
    await attachListenerIfAvailable();
    try {
      // Prefer newer signature if supported.
      if (forceRefresh != null) {
        try {
          const res = await FirebaseAuthentication.getIdToken({
            forceRefresh: Boolean(forceRefresh),
          });
          return typeof res?.token === "string" ? res.token : null;
        } catch {
          // fall through to no-args variant
        }
      }
      const res = await FirebaseAuthentication.getIdToken();
      return typeof res?.token === "string" ? res.token : null;
    } catch {
      return null;
    }
  },

  async onAuthStateChanged(cb: (u: UserLike | null) => void): Promise<Unsubscribe> {
    await attachListenerIfAvailable();
    // Emit initial state ASAP.
    void refreshCurrentUser().then((u) => {
      try {
        cb(u);
      } catch {
        // ignore
      }
    });

    if (typeof FirebaseAuthentication?.addListener !== "function") {
      return () => undefined;
    }

    try {
      const handle = await FirebaseAuthentication.addListener(
        "authStateChange",
        (change: any) => {
          cachedUser = toUserLike(change?.user);
          try {
            cb(cachedUser);
          } catch {
            // ignore
          }
        }
      );
      return () => {
        try {
          void handle?.remove?.();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => undefined;
    }
  },

  async onIdTokenChanged(
    cb: (token: string | null) => void
  ): Promise<Unsubscribe> {
    await attachListenerIfAvailable();
    if (typeof FirebaseAuthentication?.addListener !== "function") {
      try {
        queueMicrotask(() => cb(null));
      } catch {
        // ignore
      }
      return () => undefined;
    }
    try {
      const handle = await FirebaseAuthentication.addListener(
        "idTokenChange",
        (change: any) => {
          const token = typeof change?.token === "string" ? change.token : null;
          try {
            cb(token);
          } catch {
            // ignore
          }
        }
      );
      return () => {
        try {
          void handle?.remove?.();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => undefined;
    }
  },

  async signOut() {
    await attachListenerIfAvailable();
    await FirebaseAuthentication.signOut();
    cachedUser = null;
  },

  async signInWithEmailAndPassword(email: string, password: string) {
    await attachListenerIfAvailable();
    const res = await FirebaseAuthentication.signInWithEmailAndPassword({
      email,
      password,
    });
    cachedUser = toUserLike(res?.user);
    // Some implementations do not return user; fall back to getCurrentUser.
    const u = cachedUser ?? (await refreshCurrentUser());
    if (!u || !u.uid) {
      const err: any = new Error("Native sign-in did not return a user");
      err.code = "auth/native-no-user";
      throw err;
    }
    return u;
  },

  async createUserWithEmailAndPassword(email: string, password: string) {
    await attachListenerIfAvailable();
    const res = await FirebaseAuthentication.createUserWithEmailAndPassword({
      email,
      password,
    });
    cachedUser = toUserLike(res?.user);
    const u = cachedUser ?? (await refreshCurrentUser());
    if (!u || !u.uid) {
      const err: any = new Error("Native sign-up did not return a user");
      err.code = "auth/native-no-user";
      throw err;
    }
    return u;
  },

  async createAccountEmail(email: string, password: string, _displayName?: string) {
    // Native plugin does not currently support anonymous-link semantics.
    // Create the user normally.
    const res = await FirebaseAuthentication.createUserWithEmailAndPassword({
      email,
      password,
    });
    cachedUser = toUserLike(res?.user);
    const u = cachedUser ?? (await refreshCurrentUser());
    if (!u || !u.uid) {
      const err: any = new Error("Native sign-up did not return a user");
      err.code = "auth/native-no-user";
      throw err;
    }
    return u;
  },

  async sendPasswordResetEmail(email: string) {
    await attachListenerIfAvailable();
    // Optional method; only call if present.
    if (typeof FirebaseAuthentication.sendPasswordResetEmail !== "function") {
      const err: any = new Error("sendPasswordResetEmail not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    await FirebaseAuthentication.sendPasswordResetEmail({ email });
  },
};

