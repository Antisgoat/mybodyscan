import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "@/auth/mbs-auth";
import {
  disableDemo,
  disableDemoEverywhere,
  enableDemo,
  isDemo,
  setDemo,
} from "@/state/demo";

export function useDemoWireup() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, authReady } = useAuthUser();
  const [authed, setAuthed] = useState<boolean>(Boolean(user));

  useEffect(() => {
    if (!authReady) return;
    setAuthed(Boolean(user));
    try {
      if (user) {
        disableDemoEverywhere();
      }
    } catch (error) {
      console.warn("demo_wipe_failed", error);
    }
  }, [authReady, user]);

  useEffect(() => {
    // If we become authed, ensure any demo query param is removed to avoid leaking demo links into the authed app.
    if (!authed) return;
    if (!location.search.includes("demo=")) return;
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
  }, [authed, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (authed) {
      setDemo(false);
      return;
    }

    const params = new URLSearchParams(location.search || "");
    const hasDemoQuery = params.get("demo") === "1";
    const onDemoRoute = location.pathname.startsWith("/demo");
    if (hasDemoQuery || onDemoRoute) {
      enableDemo();
      return;
    }

    // If demo is already enabled via persisted storage, do not disable it on navigation.
    if (isDemo()) return;

    disableDemo();
  }, [authed, location.pathname, location.search]);
}
