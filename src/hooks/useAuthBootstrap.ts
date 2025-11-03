import { useEffect, useRef } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { disableDemoEverywhere } from '@/lib/demoState';
import { apiFetch } from '@/lib/apiFetch';

export function useAuthBootstrap() {
  const ran = useRef(false);
  useEffect(() => {
    const auth = getAuth();
    const un = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      // 1) Force exit ANY lingering demo state on login
      disableDemoEverywhere();
      // 2) Seed credits & ensure claims (idempotent on server)
      if (ran.current) return;
      ran.current = true;
      try {
        await apiFetch('/system/bootstrap', { method: 'POST', body: JSON.stringify({}) });
        await u.getIdToken(true); // refresh claims if updated
      } catch (e) {
        console.warn('bootstrap failed', e);
      }
    });
    return () => un();
  }, []);
}
