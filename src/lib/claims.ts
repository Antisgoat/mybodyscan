import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

export type UserClaims = {
  dev?: boolean;
  credits?: number;
  [k: string]: unknown;
} | null;

async function readClaims(u: User | null, force: boolean): Promise<UserClaims> {
  if (!u) return null;
  try {
    const res = await u.getIdTokenResult(force);
    const c = (res?.claims || {}) as Record<string, unknown>;
    // Normalize credits to number if present
    const raw = c["credits"];
    const credits = typeof raw === "number" ? raw : undefined;
    const dev = c["dev"] === true;
    const unlimitedCredits = c["unlimitedCredits"] === true;
    return { ...c, dev, credits, unlimitedCredits };
  } catch {
    return null;
  }
}

/** Refresh claims on the current user. Force defaults to true for compatibility. */
export async function fetchClaims(force = true): Promise<UserClaims> {
  const u = auth.currentUser;
  return await readClaims(u, force);
}

/** React hook to expose current user + claims with a refresh() helper. */
export function useClaims(): {
  user: User | null;
  claims: UserClaims;
  loading: boolean;
  refresh: (force?: boolean) => Promise<UserClaims>;
} {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [claims, setClaims] = useState<UserClaims>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const lastUidRef = useRef<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    let alive = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!alive) return;
      setUser(u);
      setLoading(true);
      const currentUid = u?.uid ?? null;
      const shouldForce = currentUid != null && lastUidRef.current !== currentUid;
      const c = await readClaims(u, shouldForce);
      if (!alive) return;
      lastUidRef.current = currentUid;
      setClaims(c);
      setLoading(false);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const refresh = useMemo(() => {
    return async (force = true) => {
      const u = auth.currentUser;
      setLoading(true);
      const c = await readClaims(u, force);
      if (force && u?.uid) {
        lastUidRef.current = u.uid;
      }
      setClaims(c);
      setLoading(false);
      return c;
    };
  }, []);

  return { user, claims, loading, refresh };
}
