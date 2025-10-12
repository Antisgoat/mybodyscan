import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { enableDemo } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type DemoState = "loading" | "error" | "timeout";

export default function DemoGate() {
  const navigate = useNavigate();
  const [state, setState] = useState<DemoState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const run = async () => {
      try {
        // Immediate navigation for existing users
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          if (!cancelled) {
            navigate("/today", { replace: true });
          }
          return;
        }

        // Set up timeout fallback (6 seconds)
        timeoutId = setTimeout(() => {
          if (!cancelled && state === "loading") {
            console.warn("Demo gate timeout after 6s");
            setState("timeout");
          }
        }, 6000);

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
          enableDemo();
        }

        if (!cancelled) {
          navigate("/today", { replace: true });
        }
      } catch (error) {
        console.error("demo_gate_error", error);
        if (!cancelled) {
          if (retryCount === 0) {
            // First failure - try once more
            setRetryCount(1);
            setTimeout(() => run(), 1000);
          } else {
            // Second failure - show error state
            setState("error");
            toast({
              variant: "destructive",
              title: "Demo login failed",
              description: "Please try again or go back to auth page.",
            });
          }
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    // Handle timeout state - attempt retry
    if (state === "timeout") {
      if (retryCount === 0) {
        setRetryCount(1);
        setTimeout(() => {
          setState("loading");
          run();
        }, 500);
      } else {
        setState("error");
        toast({
          variant: "destructive", 
          title: "Connection timeout",
          description: "Demo login is taking too long. Please try again.",
        });
      }
      return;
    }

    if (state === "loading") {
      void run();
    }

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate, state, retryCount]);

  const handleRetry = () => {
    setState("loading");
    setRetryCount(0);
  };

  const handleGoToAuth = () => {
    navigate("/auth", { replace: true });
  };

  if (state === "error" || state === "timeout") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Demo Setup Failed
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {state === "timeout" 
              ? "The demo is taking too long to load. This might be a temporary network issue."
              : "We couldn't set up the demo. Please try again or go back to the auth page."
            }
          </p>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={handleRetry} variant="default">
            Try Again
          </Button>
          <Button onClick={handleGoToAuth} variant="outline">
            Back to Auth
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading demo…</p>
    </div>
  );
}
