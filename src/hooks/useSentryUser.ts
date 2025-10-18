import { useEffect } from 'react';
import { setUserContext } from '@/lib/sentry';
import { useAuthUser } from '@/lib/auth';

/**
 * Hook to automatically set user context in Sentry when user changes
 */
export function useSentryUser() {
  const { user } = useAuthUser();

  useEffect(() => {
    if (user) {
      setUserContext({
        uid: user.uid,
        email: user.email || undefined,
        displayName: user.displayName || undefined,
      });
    } else {
      setUserContext(null);
    }
  }, [user]);
}