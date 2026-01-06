import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { auth, requireAuth } from "./firebase";
import { bootstrapSystem } from "@/lib/system";
import { call } from "./callable";
import { useAuthUser } from "@/lib/auth";

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
  try {
    await call("refreshClaims");
  } catch (error) {
    console.warn("refreshClaims failed", error);
  }

  const a = auth ?? (await requireAuth().catch(() => null));
  await a?.currentUser?.getIdToken(true);

  const info = await a?.currentUser?.getIdTokenResult();
  const isAdmin = !!info?.claims?.admin;
  const isUnlimited =
    !!info?.claims?.unlimited || !!info?.claims?.unlimitedCredits;

  const email = a?.currentUser?.email || "";
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
    await a?.currentUser?.getIdToken(true);
  }

  return { admin: isAdmin, unlimited: isUnlimited } as any;
}

/** Refresh claims on the current user. Force defaults to true for compatibility. */
export async function fetchClaims(force = true): Promise<UserClaims> {
  const a = auth ?? (await requireAuth().catch(() => null));
  const u = a?.currentUser ?? null;
  return await readClaims(u, force);
}

/** React hook to expose current user + claims with a refresh() helper. */
export function useClaims(): {
  user: User | null;
  claims: UserClaims;
  loading: boolean;
  refresh: (force?: boolean) => Promise<UserClaims>;
} {
  const { user, authReady } = useAuthUser();
  const [claims, setClaims] = useState<UserClaims>(null);
  const [loading, setLoading] = useState<boolean>(!authReady);
  const lastUidRef = useRef<string | null>(user?.uid ?? null);
  const bootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!authReady) {
        setLoading(true);
        return;
      }
      if (!user) {
        bootstrappedRef.current = null;
        lastUidRef.current = null;
        setClaims(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const shouldForce = lastUidRef.current !== user.uid;
      const c = await readClaims(user, shouldForce);
      if (!alive) return;
      lastUidRef.current = user.uid;
      setClaims(c);
      setLoading(false);

      if (bootstrappedRef.current === user.uid) return;
      bootstrappedRef.current = user.uid;
      try {
        const result = await bootstrapSystem();
        if (!result) return;
        if (result.claimsUpdated) {
          await user.getIdToken(true);
          const refreshed = await readClaims(user, true);
          if (!alive) return;
          setClaims(refreshed);
        } else if (typeof result.credits === "number") {
          setClaims((prev) => (prev ? { ...prev, credits: result.credits } : prev));
        }
      } catch (error) {
        console.error("claims_bootstrap_error", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user]);

  const refresh = useMemo(() => {
    return async (force = true) => {
      const u = user;
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
            setClaims((prev) =>
              prev ? { ...prev, credits: result.credits } : prev
            );
          }
        } catch (error) {
          console.error("claims_refresh_bootstrap_error", error);
        }
      }
      return c;
    };
  }, [user]);

  return { user: authReady ? user : null, claims, loading: !authReady || loading, refresh };
}
