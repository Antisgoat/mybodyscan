import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { enableDemo } from "@/lib/demoFlag";
import { useToast } from "@/hooks/use-toast";

const TIMEOUT_MS = 6000;

export default function DemoGate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [canRetry, setCanRetry] = useState(false);
  const [isWorking, setIsWorking] = useState(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    void handleFlow();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInOnceWithTimeout = useCallback(async (): Promise<"ok" | "timeout" | "error"> => {
    try {
      const result = await Promise.race([
        (async () => {
          const cred = await signInAnonymously(auth);
          if (!cred?.user) throw new Error("anon-sign-in-failed");
          return "ok" as const;
        })(),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS)),
      ]);
      return result;
    } catch (_) {
      return "error";
    }
  }, []);

  const afterSignedIn = useCallback((uid: string) => {
    if (typeof window !== "undefined") enableDemo();
    // Prepare demo data in background; do not block navigation
    void ensureDemoData(db, uid).catch(() => {});
    if (!cancelledRef.current) navigate("/today", { replace: true });
  }, [navigate]);

  const handleFlow = useCallback(async () => {
    try {
      setIsWorking(true);
      setCanRetry(false);

      // If already signed in, go immediately
      const existing = auth.currentUser;
      if (existing) {
        afterSignedIn(existing.uid);
        return;
      }

      // First attempt with timeout
      const first = await signInOnceWithTimeout();
      if (first === "ok") {
        const u = auth.currentUser;
        if (!u) throw new Error("auth-missing-user");
        afterSignedIn(u.uid);
        return;
      }

      // Second attempt (again with timeout)
      const second = await signInOnceWithTimeout();
      if (second === "ok") {
        const u = auth.currentUser;
        if (!u) throw new Error("auth-missing-user");
        afterSignedIn(u.uid);
        return;
      }

      // Both attempts failed or timed out
      toast({ title: "Demo sign-in unavailable", description: "Please try again.", variant: "destructive" });
      if (!cancelledRef.current) setCanRetry(true);
    } catch (error: any) {
      console.error("demo_gate_error", error);
      toast({ title: "Demo sign-in failed", description: error?.message || "Please try again.", variant: "destructive" });
      if (!cancelledRef.current) setCanRetry(true);
    } finally {
      if (!cancelledRef.current) setIsWorking(false);
    }
  }, [afterSignedIn, signInOnceWithTimeout, toast]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      {isWorking ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Preparing demo…</p>
        </>
      ) : canRetry ? (
        <>
          <p className="text-sm text-muted-foreground">Couldn’t start demo.</p>
          <button
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none"
            onClick={() => void handleFlow()}
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Almost there…</p>
        </>
      )}
    </div>
  );
}
