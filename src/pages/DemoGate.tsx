import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { enableDemo } from "@/lib/demoFlag";
import { useToast } from "@/hooks/use-toast";

export default function DemoGate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showRetryButton, setShowRetryButton] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: NodeJS.Timeout;

    const run = async () => {
      try {
        // If currentUser exists, navigate immediately
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          if (!cancelled) {
            navigate("/today", { replace: true });
          }
          return;
        }

        // Set up 6s timeout fallback
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            setShowRetryButton(true);
            toast({
              title: "Demo loading is taking longer than expected",
              description: "Please try again if the demo doesn't load automatically.",
              variant: "destructive",
            });
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
          clearTimeout(timeoutId);
          navigate("/today", { replace: true });
        }
      } catch (error) {
        console.error("demo_gate_error", error);
        clearTimeout(timeoutId);
        
        if (!cancelled) {
          // Try once more after a short delay
          setTimeout(async () => {
            if (!cancelled) {
              try {
                const retryCredential = await signInAnonymously(auth);
                if (retryCredential.user) {
                  const retryUser = auth.currentUser;
                  if (retryUser) {
                    await ensureDemoData(db, retryUser.uid);
                    if (typeof window !== "undefined") {
                      enableDemo();
                    }
                    if (!cancelled) {
                      navigate("/today", { replace: true });
                    }
                    return;
                  }
                }
              } catch (retryError) {
                console.error("demo_gate_retry_error", retryError);
              }
              
              // If retry also fails, show retry button
              setShowRetryButton(true);
              toast({
                title: "Failed to load demo",
                description: "Please try again or contact support if the issue persists.",
                variant: "destructive",
              });
            }
          }, 1000);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [navigate, toast]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setShowRetryButton(false);
    
    try {
      const credential = await signInAnonymously(auth);
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

      navigate("/today", { replace: true });
    } catch (error) {
      console.error("demo_gate_retry_error", error);
      setShowRetryButton(true);
      toast({
        title: "Retry failed",
        description: "Please try again or contact support if the issue persists.",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading demo…</p>
      {showRetryButton && (
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isRetrying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Try again
        </button>
      )}
    </div>
  );
}
