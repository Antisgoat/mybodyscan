import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { DEMO_QUERY_PARAM, isDemoMode } from "@/lib/demoFlag";
import { useFlags } from "@/lib/flags";

interface DemoModeContextValue {
  demo: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ demo: false });

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { flags } = useFlags();
  const [persistedDemo, setPersistedDemo] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isDemoMode(user, window.location);
  });

  const baseDemo = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (!flags.enableDemo) return false;
    return isDemoMode(user, window.location);
  }, [user, location.pathname, location.search, flags.enableDemo]);

  useEffect(() => {
    if (!flags.enableDemo && persistedDemo) {
      setPersistedDemo(false);
    }
  }, [flags.enableDemo, persistedDemo]);

  useEffect(() => {
    if (baseDemo) {
      if (!persistedDemo) {
        setPersistedDemo(true);
      }
      return;
    }

    if (user) {
      if (persistedDemo) {
        setPersistedDemo(false);
      }
      if (typeof window !== "undefined" && location.search.includes(`${DEMO_QUERY_PARAM}=`)) {
        const url = new URL(window.location.href);
        url.searchParams.delete(DEMO_QUERY_PARAM);
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
      }
      return;
    }

    if (persistedDemo && typeof window !== "undefined") {
      const hasParam = location.search.includes(`${DEMO_QUERY_PARAM}=`);
      if (!hasParam) {
        const url = new URL(window.location.href);
        url.searchParams.set(DEMO_QUERY_PARAM, "1");
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
      }
    }
  }, [baseDemo, persistedDemo, user, location.search, location.pathname, location.hash, navigate]);

  const demo = baseDemo || (!user && persistedDemo);

  const value = useMemo(() => ({ demo }), [demo]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext).demo;
}
