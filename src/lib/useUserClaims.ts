import { useEffect, useState } from "react";
import { getIdToken, onIdTokenChanged } from "@/auth/mbs-auth";

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    const padded = pad ? payload + "=".repeat(4 - pad) : payload;
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function useUserClaims() {
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let cancel = false;
    async function load(forceRefresh = false) {
      const token = await getIdToken({ forceRefresh }).catch(() => null);
      const next = token ? decodeJwtClaims(token) : null;
      if (!cancel) setClaims(next);
    }
    void load(true);
    let unsub: (() => void) | null = null;
    void onIdTokenChanged(() => {
      void load(false);
    }).then((u) => {
      if (!cancel) unsub = u;
    });
    return () => {
      cancel = true;
      if (unsub) unsub();
    };
  }, []);
  return claims;
}
