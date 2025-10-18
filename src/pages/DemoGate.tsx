import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getAuthSafe, getFirestoreSafe, initFirebaseApp } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { ensureDemoData } from "@/lib/demo";
import { persistDemoFlags } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ensureDemoUser, startDemo, formatAuthError, isDemoUser } from "@/lib/auth";
import { activateOfflineDemo, isDemoOffline, shouldFallbackToOffline } from "@/lib/demoOffline";
import { useAppCheckContext } from "@/components/AppCheckProvider";
import { isAppCheckActive } from "@/appCheck";
import { HAS_USDA } from "@/lib/env";
import { getAppCheckToken } from "@/appCheck";

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
    void initFirebaseApp();
  }, []);

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
      await initFirebaseApp();
      const auth = await getAuthSafe();
      if (appCheckError && !softModeToastShown.current) {
        toast({ title: "App Check not configured; proceeding in soft mode" });
        softModeToastShown.current = true;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const token = await getAppCheckToken(false);
          if (token || attempt === 1) {
            break;
          }
        } catch (tokenError) {
          if (import.meta.env.DEV) {
            console.warn("[demo] App Check token fetch failed (soft mode)", tokenError);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
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

        const auth = await getAuthSafe();
        const user = auth.currentUser;
        if (!user) throw new Error("auth-missing-user");

        const demoUser = isDemoUser(user);

        // Ensure demo content and enable demo mode; non-fatal on errors
        if (!demoUser) {
          const dbInstance = await getFirestoreSafe();
          try {
            await ensureDemoData(dbInstance, user.uid);
          } catch (err) {
            console.warn("[demo] ensureDemoData failed (non-fatal)", err);
          }
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
