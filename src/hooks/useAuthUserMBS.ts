import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';

import { auth, onAuthStateChangedSafe } from '../lib/firebase';

export function useAuthUserMBS() {
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [loading, setLoading] = useState(() => !auth?.currentUser);
  
  useEffect(() => {
    const unsub = onAuthStateChangedSafe((u) => {
      setUser(u);
      setLoading(false);
    });

    return () => {
      unsub();
    };
  }, []);
  
  return { user, loading };
}