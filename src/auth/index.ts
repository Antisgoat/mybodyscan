import type { AuthImpl } from "./facade";
import type { Unsubscribe, UserLike } from "./types";

const authPromise: Promise<AuthImpl> = __MBS_NATIVE__
  ? import("./nativeAuth").then((m) => m.impl)
  : import("./webAuth").then((m) => m.impl);

export function loadAuthImpl(): Promise<AuthImpl> {
  return authPromise;
}

export async function getCurrentUser(): Promise<UserLike | null> {
  return (await loadAuthImpl()).getCurrentUser();
}

export async function onAuthStateChanged(
  cb: (u: UserLike | null) => void
): Promise<Unsubscribe> {
  return (await loadAuthImpl()).onAuthStateChanged(cb);
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  const impl = await loadAuthImpl();
  if (!impl.onIdTokenChanged) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  return impl.onIdTokenChanged(cb);
}

export async function getIdToken(forceRefresh?: boolean): Promise<string | null> {
  return (await loadAuthImpl()).getIdToken(forceRefresh);
}

export async function signOut(): Promise<void> {
  return (await loadAuthImpl()).signOut();
}

export async function signInWithGoogle(next?: string | null): Promise<void> {
  const impl = await loadAuthImpl();
  if (!impl.signInWithGoogle) {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.signInWithGoogle(next);
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  return (await loadAuthImpl()).signInWithEmailAndPassword(email, password);
}
