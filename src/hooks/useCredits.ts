import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, getFirebaseConfig } from "@/lib/firebase";
import { call } from "@/lib/callable";
import { getIdToken, useAuthUser } from "@/lib/authFacade";

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    const padded = pad ? payload + "=".repeat(4 - pad) : payload;
    const json = atob(padded);
    const obj = JSON.parse(json) as Record<string, unknown>;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, authReady } = useAuthUser();
  const uid = user?.uid ?? null;
  const [unlimitedFromToken, setUnlimitedFromToken] = useState(false);
  const [unlimitedFromMirror, setUnlimitedFromMirror] = useState(false);
  const refreshAttemptRef = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  let projectId = "";
  try {
    projectId = getFirebaseConfig().projectId;
  } catch {
    projectId = "";
  }

  useEffect(() => {
    void (async () => {
      if (!authReady) {
        setLoading(true);
        return;
      }

      if (!uid) {
        setCredits(0);
        setUnlimitedFromToken(false);
        setUnlimitedFromMirror(false);
        setLoading(false);
        refreshAttemptRef.current = null;
        return;
      }

      try {
        let token = await getIdToken({ forceRefresh: false });
        if (refreshAttemptRef.current !== uid) {
          refreshAttemptRef.current = uid;
          try {
            await call("refreshClaims");
            token = await getIdToken({ forceRefresh: true });
            setRefreshTick((prev) => prev + 1);
          } catch (refreshError) {
            if (import.meta.env.DEV) {
              console.warn("[credits] refreshClaims failed", refreshError);
            }
          }
        }

        const claims = token ? decodeJwtClaims(token) : null;
        const tokenPro =
          claims?.unlimitedCredits === true ||
          claims?.unlimited === true ||
          claims?.admin === true ||
          claims?.staff === true;
        setUnlimitedFromToken(Boolean(tokenPro));
      } catch (e: any) {
        setError(e?.message || "auth_unavailable");
        setLoading(false);
      }
    })();
  }, [authReady, uid]);

  useEffect(() => {
    if (!uid) return;
    if (!db) {
      setError("firestore_unavailable");
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, `users/${uid}/private/credits`);
    const userRef = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const amt = snap.data()?.creditsSummary?.totalAvailable as
          | number
          | undefined;
        setCredits(amt ?? 0);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching credits:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        setUnlimitedFromMirror((snap.data() as any)?.unlimitedCredits === true);
      },
      () => {
        // Fail closed.
        setUnlimitedFromMirror(false);
      }
    );
    return () => {
      unsub();
      unsubUser();
    };
  }, [uid, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const unlimited = unlimitedFromToken || unlimitedFromMirror;

  if (unlimited) {
    return {
      credits: Infinity,
      loading,
      error,
      uid,
      projectId,
      unlimited: true,
      remaining: Infinity,
      used: 0,
      refresh,
    } as const;
  }

  return {
    credits,
    loading,
    error,
    uid,
    projectId,
    unlimited: false,
    remaining: credits,
    used: 0,
    refresh,
  } as const;
}
