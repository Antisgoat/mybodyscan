import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { persistDemoFlags } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ensureDemoUser, startDemo, formatAuthError } from "@/lib/auth";
import { activateOfflineDemo, isDemoOffline, shouldFallbackToOffline } from "@/lib/demoOffline";
import { useAppCheckReady } from "@/components/AppCheckProvider";

export default function DemoGate() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);

  const appCheckReady = useAppCheckReady();

  useEffect(() => {
    let cancelled = false;
    if (!appCheckReady) return;
    (async () => {
      if (!cancelled && !auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          if (shouldFallbackToOffline(error)) {
            activateOfflineDemo("auth");
          } else {
            throw error;
          }
        }
      }
    })().catch((e) => console.error("Demo anon sign-in failed:", e));
    return () => {
      cancelled = true;
    };
  }, [appCheckReady]);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      try {
        setFailed(false);
        setLoading(true);

        // Do NOT write any user data for demo. Only enable demo mode and optional anon auth.
        await ensureDemoUser();
        if (typeof window !== "undefined") {
          try {
            persistDemoFlags();
          } catch (err) {
            console.warn("[demo] unable to persist demo flags", err);
          }
        }

        if (mountedRef.current) {
          await startDemo({ navigate, skipEnsure: true });
        }
      } catch (error: any) {
        console.error("demo_gate_error", error);
        if (shouldFallbackToOffline(error) || isDemoOffline()) {
          activateOfflineDemo("auth");
          if (mountedRef.current) {
            await startDemo({ navigate, skipEnsure: true });
          }
          return;
        }
        if (mountedRef.current) {
          toast({
            title: "Unable to start demo",
            description: formatAuthError("Demo", error) || "Network appears offline. Try again once reconnected.",
            variant: "destructive",
          });
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
