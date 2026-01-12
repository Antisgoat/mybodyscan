import { useEffect, useMemo, useRef, useState } from "react";
import { bootstrapSystem } from "@/lib/system";
import { call } from "./callable";
import { getCurrentUser, getIdToken, useAuthUser } from "@/auth/mbs-auth";
import { isNative } from "@/lib/platform";
import type { AuthUser } from "@/lib/auth/types";

export type UserClaims = {
  dev?: boolean;
  credits?: number;
  [k: string]: unknown;
} | null;

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  // atob is available in browser/WebView environments.
  return atob(padded);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]!);
    const obj = JSON.parse(json) as Record<string, unknown>;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

async function readClaimsForUser(
  u: AuthUser | null,
  force: boolean
): Promise<UserClaims> {
  if (!u) return null;
  try {
    const token = await getIdToken({ forceRefresh: force });
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    const raw = payload["credits"];
    const credits = typeof raw === "number" ? raw : undefined;
    const dev = payload["dev"] === true;
    const unlimitedCredits = payload["unlimitedCredits"] === true;
    const unlimited = payload["unlimited"] === true;
    return { ...payload, dev, credits, unlimitedCredits, unlimited };
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

  const user = await getCurrentUser().catch(() => null);
  const claims = await readClaimsForUser(user, true);
  const isAdmin = Boolean((claims as any)?.admin);
  const isUnlimited = Boolean(
    (claims as any)?.unlimited || (claims as any)?.unlimitedCredits
  );

  const email = user?.email || "";
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
    await getIdToken({ forceRefresh: true }).catch(() => null);
  }

  return { admin: isAdmin, unlimited: isUnlimited } as any;
}

/** Refresh claims on the current user. Force defaults to true for compatibility. */
export async function fetchClaims(force = true): Promise<UserClaims> {
  const u = await getCurrentUser().catch(() => null);
  return await readClaimsForUser(u, force);
}

/** React hook to expose current user + claims with a refresh() helper. */
export function useClaims(): {
  user: AuthUser | null;
  claims: UserClaims;
  loading: boolean;
  refresh: (force?: boolean) => Promise<UserClaims>;
} {
  const { user, authReady } = useAuthUser();
  const [claims, setClaims] = useState<UserClaims>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const lastUidRef = useRef<string | null>(user?.uid ?? null);
  const bootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!authReady) {
      setLoading(true);
      return () => {
        alive = false;
      };
    }
    void (async () => {
      if (!alive) return;
      setLoading(true);
      const u = user ?? null;
      const currentUid = u?.uid ?? null;
      const shouldForce =
        currentUid != null && lastUidRef.current !== currentUid;
      const c = await readClaimsForUser(u, shouldForce);
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
                await getIdToken({ forceRefresh: true }).catch(() => null);
                const refreshed = await readClaimsForUser(u, true);
                if (!alive) return;
                lastUidRef.current = u.uid;
                setClaims(refreshed);
              } else if (typeof result.credits === "number") {
                setClaims((prev) =>
                  prev ? { ...prev, credits: result.credits } : prev
                );
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
    };
  }, [authReady, user]);

  const refresh = useMemo(() => {
    return async (force = true) => {
      const u = user ?? null;
      setLoading(true);
      const c = await readClaimsForUser(u, force);
      if (force && u?.uid) {
        lastUidRef.current = u.uid;
      }
      setClaims(c);
      setLoading(false);
      if (u?.uid) {
        try {
          const result = await bootstrapSystem();
          if (result?.claimsUpdated) {
            await getIdToken({ forceRefresh: true }).catch(() => null);
            const refreshed = await readClaimsForUser(u, true);
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

  return { user, claims, loading, refresh };
}
