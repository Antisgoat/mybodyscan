import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function DemoGate() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    const signInWithTimeout = async (timeoutMs: number) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      );
      // If signInAnonymously never resolves in time, this will reject by timeout
      return Promise.race([signInAnonymously(auth), timeout]);
    };

    const run = async () => {
      try {
        setFailed(false);
        setLoading(true);

        // If already signed in (anon or real), go straight to app
        if (auth.currentUser) {
          if (mountedRef.current) navigate("/coach", { replace: true });
          return;
        }

        // Try anonymous sign-in with a 6s timeout, retry once
        try {
          await signInWithTimeout(6000);
        } catch (e1) {
          try {
            await signInWithTimeout(6000);
          } catch (e2) {
            throw e2;
          }
        }

        const user = auth.currentUser;
        if (!user) throw new Error("auth-missing-user");

        // Ensure demo content and enable demo mode; non-fatal on errors
        try {
          await ensureDemoData(db, user.uid);
        } catch (err) {
          console.warn("[demo] ensureDemoData failed (non-fatal)", err);
        }
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
          } catch (err) {
            console.warn("[demo] unable to persist session flag", err);
          }
        }

        if (mountedRef.current) navigate("/coach", { replace: true });
      } catch (error: any) {
        console.error("demo_gate_error", error);
        if (mountedRef.current) {
          toast({ title: "Unable to start demo", description: "Please try again.", variant: "destructive" });
          setFailed(true);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void run();

    return () => {
      mountedRef.current = false;
    };
  }, [navigate, attempt]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center p-6">
      {loading && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading demo…</p>
        </>
      )}
      {!loading && failed && (
        <>
          <p className="text-sm text-muted-foreground">We couldn’t start demo right now.</p>
          <Button onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</Button>
        </>
      )}
      {!loading && !failed && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Starting demo…</p>
        </>
      )}
    </div>
  );
}
