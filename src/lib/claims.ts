import { useEffect, useMemo, useRef, useState } from "react";
import { type User } from "firebase/auth";

import { bootstrapSystem } from "@/lib/system";
import { call } from "./callable";
import { auth, getFirebaseInitError, onAuthStateChangedSafe } from "./firebase";

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

export async function refreshClaimsAndAdminBoost() {
  const authInstance = auth;
  if (!authInstance) {
    console.warn("[claims] Firebase Auth unavailable:", getFirebaseInitError());
    return { admin: false, unlimited: false };
  }

  const currentUser = authInstance.currentUser;
  if (!currentUser) {
    return { admin: false, unlimited: false };
  }

  try {
    await call("refreshClaims");
  } catch (error) {
    console.warn("refreshClaims failed", error);
  }

  await currentUser.getIdToken(true);

  const info = await currentUser.getIdTokenResult();
  const isAdmin = !!info?.claims?.admin;
  const isUnlimited = !!info?.claims?.unlimited || !!info?.claims?.unlimitedCredits;

  const email = currentUser.email || "";
  if (!isUnlimited && email.toLowerCase() === "developer@adlrlabs.com") {
    try {
      await call("grantUnlimitedCredits");
    } catch (error) {
      console.warn("grantUnlimitedCredits failed", error);
    }
    try {
      await call("refreshClaims");
    } catch (error) {
      console.warn("refreshClaims retry failed", error);
    }
    await currentUser.getIdToken(true);
  }

  return { admin: isAdmin, unlimited: isUnlimited } as any;
}

/** Refresh claims on the current user. Force defaults to true for compatibility. */
export async function fetchClaims(force = true): Promise<UserClaims> {
  const u = auth?.currentUser ?? null;
  return await readClaims(u, force);
}

/** React hook to expose current user + claims with a refresh() helper. */
export function useClaims(): {
  user: User | null;
  claims: UserClaims;
  loading: boolean;
  refresh: (force?: boolean) => Promise<UserClaims>;
} {
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [claims, setClaims] = useState<UserClaims>(null);
  const [loading, setLoading] = useState<boolean>(() => auth?.currentUser == null);
  const lastUidRef = useRef<string | null>(auth?.currentUser?.uid ?? null);
  const bootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const unsub = onAuthStateChangedSafe(async (u) => {
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

      if (u?.uid) {
        if (bootstrappedRef.current !== u.uid) {
          bootstrappedRef.current = u.uid;
          void (async () => {
            try {
              const result = await bootstrapSystem();
              if (!result) return;
              if (result.claimsUpdated) {
                await u.getIdToken(true);
                const refreshed = await readClaims(u, true);
                if (!alive) return;
                lastUidRef.current = u.uid;
                setClaims(refreshed);
              } else if (typeof result.credits === "number") {
                setClaims((prev) => (prev ? { ...prev, credits: result.credits } : prev));
              }
            } catch (error) {
              console.error("claims_bootstrap_error", error);
            }
          })();
        }
      } else {
        bootstrappedRef.current = null;
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const refresh = useMemo(() => {
    return async (force = true) => {
      const authInstance = auth;
      if (!authInstance) {
        console.warn("[claims] Cannot refresh claims without Firebase Auth:", getFirebaseInitError());
        setLoading(false);
        setClaims(null);
        return null;
      }

      const u = authInstance.currentUser;
      setLoading(true);
      const c = await readClaims(u, force);
      if (force && u?.uid) {
        lastUidRef.current = u.uid;
      }
      setClaims(c);
      setLoading(false);
      if (u?.uid) {
        try {
          const result = await bootstrapSystem();
          if (result?.claimsUpdated) {
            await u.getIdToken(true);
            const refreshed = await readClaims(u, true);
            setClaims(refreshed);
            return refreshed;
          }
          if (result && typeof result.credits === "number") {
            setClaims((prev) => (prev ? { ...prev, credits: result.credits } : prev));
          }
        } catch (error) {
          console.error("claims_refresh_bootstrap_error", error);
        }
      }
      return c;
    };
  }, []);

  return { user, claims, loading, refresh };
}
