import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { enableDemo } from "@/lib/demoFlag";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

const SIGN_IN_TIMEOUT_MS = 6000;

export default function DemoGate() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const run = async () => {
      try {
        // If user already signed in, navigate immediately
        if (auth.currentUser) {
          if (!cancelled) {
            navigate("/today", { replace: true });
          }
          return;
        }

        // Sign in anonymously with timeout
        const signInPromise = signInAnonymously(auth);
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("sign-in-timeout"));
          }, SIGN_IN_TIMEOUT_MS);
        });

        const credential = await Promise.race([signInPromise, timeoutPromise]);
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (!credential.user) {
          throw new Error("anon-sign-in-failed");
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
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        console.error("demo_gate_error", error);
        const errorMessage = error instanceof Error ? error.message : "unknown-error";
        
        // If this is our first attempt and we hit a timeout, retry once
        if (errorMessage === "sign-in-timeout" && retryCount === 0) {
          console.warn("Sign-in timed out, retrying once...");
          setRetryCount(1);
          return;
        }

        // Show error UI after failed retry or other errors
        if (!cancelled) {
          toast({
            title: "Demo sign-in failed",
            description: "Unable to start the demo session. Please try again.",
            variant: "destructive",
          });
          setError(errorMessage);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate, retryCount]);

  const handleTryAgain = () => {
    setError(null);
    setRetryCount(0);
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <div className="max-w-md space-y-4">
          <h2 className="text-2xl font-semibold">Unable to start demo</h2>
          <p className="text-sm text-muted-foreground">
            We couldn't connect to the demo service. This might be a temporary issue.
          </p>
          <Button onClick={handleTryAgain} className="mt-4">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        {retryCount > 0 ? "Retrying demo sign-in…" : "Loading demo…"}
      </p>
    </div>
  );
}
