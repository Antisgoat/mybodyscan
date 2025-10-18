import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { auth, db } from "@app/lib/firebase.ts";
import { signInAnonymously } from "firebase/auth";
import { ensureDemoData } from "@app/lib/demo.ts";
import { persistDemoFlags } from "@app/lib/demoFlag.tsx";
import { toast } from "@app/hooks/use-toast.ts";
import { Button } from "@app/components/ui/button.tsx";
import { ensureDemoUser, startDemo, formatAuthError } from "@app/lib/auth.ts";
import { activateOfflineDemo, isDemoOffline, shouldFallbackToOffline } from "@app/lib/demoOffline.ts";
import { useAppCheckContext } from "@app/components/AppCheckProvider.tsx";
import { isAppCheckActive } from "@app/appCheck.ts";
import { HAS_USDA } from "@app/lib/env.ts";

export default function DemoGate() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const { isAppCheckReady, error: appCheckError } = useAppCheckContext();
  const softModeToastShown = useRef(false);
  const flagsLogged = useRef(false);

  useEffect(() => {
    if (!isAppCheckReady || flagsLogged.current) return;
    const appCheckMode: "soft" | "disabled" = appCheckError || isAppCheckActive() ? "soft" : "disabled";
    console.info("demo_flags", { appCheck: appCheckMode, usda: HAS_USDA });
    flagsLogged.current = true;
  }, [isAppCheckReady, appCheckError]);

  useEffect(() => {
    if (!isAppCheckReady) return;
    let cancelled = false;
    (async () => {
      if (appCheckError && !softModeToastShown.current) {
        toast({ title: "App Check not configured; proceeding in soft mode" });
        softModeToastShown.current = true;
      }
      await new Promise((r) => setTimeout(r, 50));
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
  }, [isAppCheckReady, appCheckError]);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      if (!isAppCheckReady) {
        setLoading(true);
        return;
      }
      try {
        setFailed(false);
        setLoading(true);

        await ensureDemoUser();

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
            description: formatAuthError("Demo", error),
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
  }, [navigate, attempt, isAppCheckReady]);

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
