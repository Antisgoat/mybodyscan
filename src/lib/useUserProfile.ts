import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { User } from "firebase/auth";

export type UserProfile = {
  role?: string;
  unlimitedCredits?: boolean;
  credits?: number;
  // other fields allowed; keep type open
};

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const u: User | null = auth?.currentUser ?? null;
    if (!u) { setProfile(null); setLoading(false); return; }
    const ref = doc(db, "users", u.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setProfile((snap.exists() ? (snap.data() as UserProfile) : null));
      setLoading(false);
    }, (_err) => {
      // On error, fail closed but keep UI stable
      setProfile(null);
      setLoading(false);
    });
    return () => unsub();
  }, [auth?.currentUser?.uid]); // re-sub when uid changes

  return { profile, loading };
}
