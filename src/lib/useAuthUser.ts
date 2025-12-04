import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase"; // use the existing initialized export
import { apiGet } from "@/lib/http";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(typeof auth !== "undefined" ? auth.currentUser : null);
  const [loading, setLoading] = useState<boolean>(true);

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

    const unsub = onAuthStateChanged(auth, (u) => {
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
