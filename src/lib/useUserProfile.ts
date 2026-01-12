import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/auth/client";

export type UserProfile = {
  role?: string;
  unlimitedCredits?: boolean;
  credits?: number;
  // other fields allowed; keep type open
};

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, authReady } = useAuthUser();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      (_err) => {
        // On error, fail closed but keep UI stable
        setProfile(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [authReady, uid]); // re-sub when uid changes

  return { profile, loading };
}
