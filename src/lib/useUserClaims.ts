import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
export function useUserClaims() {
  const [claims, setClaims] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    let cancel = false;
    async function load() {
      const u = auth.currentUser;
      if (!u) {
        setClaims(null);
        return;
      }
      const r = await u.getIdTokenResult(true).catch(() => null);
      if (!cancel) setClaims(r?.claims || null);
    }
    load();
    const unsub = auth.onIdTokenChanged(() => load());
    return () => {
      cancel = true;
      unsub();
    };
  }, []);
  return claims;
}
