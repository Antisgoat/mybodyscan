import { useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";

import { auth, getFirebaseInitError } from "@/lib/firebase";
export function useUserClaims() {
  const [claims, setClaims] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    let cancel = false;
    if (!auth) {
      console.warn("[useUserClaims] Firebase Auth unavailable:", getFirebaseInitError());
      setClaims(null);
      return () => {
        cancel = true;
      };
    }

    async function load(currentUser: User | null) {
      if (!currentUser) {
        if (!cancel) setClaims(null);
        return;
      }
      const result = await currentUser.getIdTokenResult(true).catch(() => null);
      if (!cancel) setClaims(result?.claims || null);
    }
    const initialUser = auth?.currentUser ?? null;
    void load(initialUser);
    const unsub = onIdTokenChanged(auth, (next) => {
      void load(next);
    });
    return () => {
      cancel = true;
      unsub();
    };
  }, []);
  return claims;
}
