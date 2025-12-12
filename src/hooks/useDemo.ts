import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { disableDemo, enableDemo, setDemo } from "@/state/demo";

function clearStoredDemoFlags() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("mbs.demo");
    window.localStorage.removeItem("mbs:demo");
    window.localStorage.removeItem("mbs_demo");
  } catch (error) {
    console.warn("demo.localStorage.clear_failed", error);
  }
  try {
    window.sessionStorage.removeItem("mbs.demo");
    window.sessionStorage.removeItem("mbs:demo");
    window.sessionStorage.removeItem("mbs_demo");
  } catch (error) {
    console.warn("demo.sessionStorage.clear_failed", error);
  }
}

export function useDemoWireup() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean>(Boolean(auth?.currentUser));

  useEffect(() => {
    if (!auth) {
      setAuthed(false);
      return undefined;
    }
    // Subscribe once. Re-subscribing on every navigation can cause re-entrant demo state toggles
    // (and in production can surface as React max-update-depth / #185).
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthed(Boolean(user));
      try {
        // Only wipe demo flags when a real authed user exists. When signed out, demo mode is allowed.
        if (user) {
          clearStoredDemoFlags();
          setDemo(false);
        }
      } catch (error) {
        console.warn("demo_wipe_failed", error);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("mbs_demo");
        if (stored === "1" || stored === "true") {
          enableDemo();
          return;
        }
      } catch {
        // ignore storage read errors
      }
    }

    disableDemo();
  }, [authed, location.pathname, location.search]);
}
