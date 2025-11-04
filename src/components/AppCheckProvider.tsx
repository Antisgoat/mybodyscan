import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ensureAppCheck } from "@/lib/firebase";

interface AppCheckContextValue { isAppCheckReady: boolean; error: Error | null }

const AppCheckContext = createContext<AppCheckContextValue>({ isAppCheckReady: true, error: null });

export function AppCheckProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppCheckContextValue>({ isAppCheckReady: true, error: null });

  useEffect(() => {
    try {
      ensureAppCheck();
      setState({ isAppCheckReady: true, error: null });
    } catch (error) {
      setState({ isAppCheckReady: true, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }, []);

  return <AppCheckContext.Provider value={state}>{children}</AppCheckContext.Provider>;
}

export function useAppCheckContext(): AppCheckContextValue {
  return useContext(AppCheckContext);
}

export function useAppCheckReady(): boolean {
  return useAppCheckContext().isAppCheckReady;
}

