import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { auth, onAuthStateChangedSafe } from "@/lib/firebase";
import { apiGet } from "@/lib/http";

export function useAuthUser() {
  const initialUser = auth?.currentUser ?? null;
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState<boolean>(() => initialUser == null);

  useEffect(() => {
    async function afterLogin(u: User) {
      try {
        await apiGet("/api/system/bootstrap", { expectJson: false });
      } catch (error) {
        console.warn("auth.bootstrap_failed", error);
      }
      try {
        await u.getIdToken(true);
      } catch (error) {
        console.warn("auth.refresh_token_failed", error);
      }
    }

    const unsub = onAuthStateChangedSafe((u) => {
      setUser(u ?? null);
      setLoading(false);
      if (u) {
        void afterLogin(u);
      }
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
