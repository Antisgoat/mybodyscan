import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { initAppCheck, isAppCheckReady, waitForAppCheckReady } from "@app/appCheck.ts";

interface AppCheckContextValue {
  isAppCheckReady: boolean;
  error: Error | null;
}

const AppCheckContext = createContext<AppCheckContextValue>({ isAppCheckReady: false, error: null });

export function AppCheckProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<boolean>(() => isAppCheckReady());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initAppCheck();
        await waitForAppCheckReady();
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.warn("[app-check] initialization failed", err);
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AppCheckContextValue>(() => ({ isAppCheckReady: ready, error }), [ready, error]);

  return <AppCheckContext.Provider value={value}>{children}</AppCheckContext.Provider>;
}

export function useAppCheckContext(): AppCheckContextValue {
  return useContext(AppCheckContext);
}

export function useAppCheckReady(): boolean {
  return useAppCheckContext().isAppCheckReady;
}

