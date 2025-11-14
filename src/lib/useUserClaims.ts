import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export function useUserClaims() {
  const [claims, setClaims] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    let cancel = false;
    async function run() {
      const u = auth.currentUser;
      if (!u) { setClaims(null); return; }
      const tr = await u.getIdTokenResult(true).catch(() => null);
      if (!cancel) setClaims(tr?.claims || null);
    }
    run();
    const unsub = auth.onIdTokenChanged(() => run());
    return () => { cancel = true; unsub(); };
  }, []);
  return claims;
}
