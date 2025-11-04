import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { setDemo } from "../state/demo";

export function useDemoWireup() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const hasDemoQuery = location.search.includes("demo");
    const active = !authUser && (location.pathname.startsWith("/demo") || hasDemoQuery);
    setDemo(active);
  }, [location.pathname, location.search, authUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        setDemo(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setDemo(false);
    if (location.search.includes("demo")) {
      navigate({ pathname: location.pathname, search: "" }, { replace: true });
    }
  }, [authUser, location.pathname, location.search, navigate]);
}
