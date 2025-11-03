import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "@/lib/auth";
import { DEMO_KEY, isDemo as readDemo } from "@/lib/demo";
import { disableDemo as disableDemoMode } from "@/lib/demoFlag";

interface DemoModeContextValue {
  demo: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ demo: false });

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthUser();
  const [demo, setDemo] = useState<boolean>(() => readDemo());

  useEffect(() => {
    if (user && demo) {
      disableDemoMode();
      setDemo(false);
    }
  }, [user, demo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== DEMO_KEY) return;
      setDemo(readDemo());
    };
    const handleChange = () => {
      setDemo(readDemo());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("mbs:demo-change", handleChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("mbs:demo-change", handleChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setDemo(readDemo());
    }
  }, [user]);

  const value = useMemo(() => ({ demo }), [demo]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext).demo;
}
