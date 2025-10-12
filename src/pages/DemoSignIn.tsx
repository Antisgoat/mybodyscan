import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from "firebase/auth";
import { enableDemo } from "@/lib/demoFlag";

export default function DemoSignIn() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        enableDemo();
        const auth = getAuth();
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
        navigate("/coach", { replace: true });
      } catch (e) {
        console.error("Demo sign-in failed", e);
        navigate("/auth?demoError=1", { replace: true });
      }
    })();
  }, [navigate]);

  return null;
}
