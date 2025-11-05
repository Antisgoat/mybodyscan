import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { disableDemo, disableDemoEverywhere, enableDemo } from "../state/demo";

export function useDemoWireup() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    if (authUser) {
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
  }, [location.pathname, location.search, authUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        disableDemoEverywhere(navigate);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    disableDemoEverywhere(navigate);
  }, [authUser, navigate]);
}
