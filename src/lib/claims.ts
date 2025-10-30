import { useEffect, useMemo, useState } from "react";
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

/** Force-refresh claims on the current user (getIdTokenResult(true)). */
export async function fetchClaims(): Promise<UserClaims> {
  const u = auth.currentUser;
  return await readClaims(u, true);
}

/** React hook to expose current user + claims with a refresh() helper. */
export function useClaims(): {
  user: User | null;
  claims: UserClaims;
  loading: boolean;
  refresh: () => Promise<UserClaims>;
} {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [claims, setClaims] = useState<UserClaims>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!alive) return;
      setUser(u);
      setLoading(true);
      const c = await readClaims(u, true);
      if (!alive) return;
      setClaims(c);
      setLoading(false);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const refresh = useMemo(() => {
    return async () => {
      const u = auth.currentUser;
      const c = await readClaims(u, true);
      setClaims(c);
      return c;
    };
  }, []);

  return { user, claims, loading, refresh };
}
