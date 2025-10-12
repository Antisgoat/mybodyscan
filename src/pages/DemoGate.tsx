import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";

const DEMO_FLAG_KEY = "mbs_demo";

export default function DemoGate() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          if (!cancelled) {
            navigate("/coach", { replace: true });
          }
          return;
        }
        if (!auth.currentUser) {
          const credential = await signInAnonymously(auth);
          if (!credential.user) {
            throw new Error("anon-sign-in-failed");
          }
        }
        const user = auth.currentUser;
        if (!user) {
          throw new Error("auth-missing-user");
        }

        await ensureDemoData(db, user.uid);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(DEMO_FLAG_KEY, "1");
        }

        if (!cancelled) {
          navigate("/coach", { replace: true });
        }
      } catch (error) {
        console.error("demo_gate_error", error);
        if (!cancelled) {
          navigate("/auth?demoError=1", { replace: true });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading demo…</p>
    </div>
  );
}
