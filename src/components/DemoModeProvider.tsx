import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "@/lib/auth";
import { DEMO_KEYS, disableDemoEverywhere, isDemoEffective, isDemoLocal } from "@/lib/demoState";

interface DemoModeContextValue {
  demo: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ demo: false });

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthUser();
  const authed = !!user;
  const authedRef = useRef(authed);
  const [demo, setDemo] = useState<boolean>(() => isDemoEffective(authed));

  useEffect(() => {
    authedRef.current = authed;
    if (authed) {
      disableDemoEverywhere();
    }
    setDemo(isDemoEffective(authed));
  }, [authed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key && !DEMO_KEYS.includes(event.key)) return;
      setDemo(isDemoEffective(authedRef.current));
    };
    const handleChange = () => {
      setDemo(isDemoEffective(authedRef.current));
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("mbs:demo-change", handleChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("mbs:demo-change", handleChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!authed) {
      setDemo(isDemoLocal());
    }
  }, [authed]);

  const value = useMemo(() => ({ demo }), [demo]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext).demo;
}
