import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { isDemo } from "@/state/demo";
import { subscribeDemo } from "@/state/demo";

interface DemoModeContextValue {
  demo: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ demo: false });

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const demo = useSyncExternalStore(subscribeDemo, isDemo, isDemo);
  const value = useMemo(() => ({ demo }), [demo]);
  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext).demo;
}
