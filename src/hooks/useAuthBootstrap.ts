import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { onAuthStateChanged } from 'firebase/auth';
import { disableDemoEverywhere } from '@/lib/demoState';
import { auth } from '@/lib/firebase';
import { bootstrapSystem } from '@/lib/system';

export function useAuthBootstrap() {
  const ranForUid = useRef<string | null>(null);
  const failureCountRef = useRef(0);
  const lastToastAtRef = useRef<number>(0);
  const { toast } = useToast();
  useEffect(() => {
    if (!auth) return undefined;
    const un = onAuthStateChanged(auth, async (u) => {
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
        await bootstrapSystem();
        await u.getIdToken(true); // refresh claims if updated
        failureCountRef.current = 0;
      } catch (e) {
        console.warn('bootstrap failed', e);
        failureCountRef.current += 1;
        const now = Date.now();
        if (failureCountRef.current > 1 && now - lastToastAtRef.current > 10_000) {
          toast({
            title: 'Refreshing access failed',
            description: 'We could not refresh your permissions. Try signing out and back in.',
            variant: 'destructive',
          });
          lastToastAtRef.current = now;
        }
      }
    });
    return () => un();
  }, []);
}
