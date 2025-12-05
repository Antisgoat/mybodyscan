import { useEffect, useRef } from 'react';

import { apiFetchJson } from '@/lib/apiFetch';
import { disableDemoEverywhere } from '@/lib/demoState';
import { onAuthStateChangedSafe } from '@/lib/firebase';

export function useAuthBootstrap() {
  const ranForUid = useRef<string | null>(null);
  useEffect(() => {
    const un = onAuthStateChangedSafe(async (u) => {
      if (!u) {
        ranForUid.current = null;
        return;
      }
      // 1) Force exit ANY lingering demo state on login
      disableDemoEverywhere();
      // 2) Seed credits & ensure claims (idempotent on server)
      if (ranForUid.current === u.uid) return;
      ranForUid.current = u.uid;
      try {
        await apiFetchJson('/system/bootstrap', { method: 'POST', body: JSON.stringify({}) });
        await u.getIdToken(true); // refresh claims if updated
      } catch (e) {
        console.warn('bootstrap failed', e);
      }
    });
    return () => un();
  }, []);
}
