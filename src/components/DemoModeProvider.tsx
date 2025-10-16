import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { DEMO_QUERY_PARAM, isDemoMode } from "@/lib/demoFlag";
import { isDemoOffline, subscribeDemoOffline } from "@/lib/demoOffline";

interface DemoModeContextValue {
  demo: boolean;
  offline: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ demo: false, offline: false });

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [offline, setOffline] = useState<boolean>(() => isDemoOffline());

  useEffect(() => {
    return subscribeDemoOffline((next) => {
      setOffline(next.active);
    });
  }, []);

  const computeDemo = useCallback(() => {
    if (offline) return true;
    return isDemoMode(user, { pathname: location.pathname, search: location.search });
  }, [offline, user, location.pathname, location.search]);

  const [demo, setDemo] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return computeDemo();
  });

  useEffect(() => {
    setDemo(computeDemo());
  }, [computeDemo]);

  useEffect(() => {
    if (demo) return;
    if (typeof window === "undefined") return;
    if (!location.search.includes(`${DEMO_QUERY_PARAM}=`)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(DEMO_QUERY_PARAM);
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
  }, [demo, navigate, location.pathname, location.search, location.hash]);

  const value = useMemo(() => ({ demo, offline }), [demo, offline]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext).demo;
}

export function useOfflineDemo(): boolean {
  return useContext(DemoModeContext).offline;
}
