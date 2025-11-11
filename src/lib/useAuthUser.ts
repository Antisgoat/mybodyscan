import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase"; // use the existing initialized export

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(typeof auth !== "undefined" ? auth.currentUser : null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
