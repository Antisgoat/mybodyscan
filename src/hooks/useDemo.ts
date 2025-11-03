import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { setDemo } from "../state/demo";

export function useDemoWireup() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const active = location.pathname.startsWith("/demo") || url.searchParams.has("demo");
    setDemo(active);
  }, [location]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setDemo(false);
      }
    });
    return unsubscribe;
  }, []);
}
