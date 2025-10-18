import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getSequencedAuth } from '../lib/firebase/init'; // safe fallback — if project has its own, user can rewire

export function useAuthUserMBS() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const auth = await getSequencedAuth();
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);
  
  return { user, loading };
}