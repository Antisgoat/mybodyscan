import { createContext, useContext, type ReactNode } from "react";

interface AppCheckContextValue { isAppCheckReady: boolean; error: Error | null }

const AppCheckContext = createContext<AppCheckContextValue>({ isAppCheckReady: true, error: null });

export function AppCheckProvider({ children }: { children: ReactNode }) {
  return <AppCheckContext.Provider value={{ isAppCheckReady: true, error: null }}>{children}</AppCheckContext.Provider>;
}

export function useAppCheckContext(): AppCheckContextValue {
  return useContext(AppCheckContext);
}

export function useAppCheckReady(): boolean {
  return useAppCheckContext().isAppCheckReady;
}

