import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { ensureDemoData } from "@/lib/demo";
import { enableDemo } from "@/lib/demoFlag";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function DemoGate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const attemptSignIn = async (): Promise<boolean> => {
      try {
        // If currentUser exists (signed in), navigate immediately
        if (auth.currentUser) {
          if (!cancelled) {
            // Navigate to /today or /coach based on whether user is anonymous
            const targetPath = auth.currentUser.isAnonymous ? "/coach" : "/today";
            navigate(targetPath, { replace: true });
          }
          return true;
        }

        // Sign in anonymously
        const credential = await signInAnonymously(auth);
        if (!credential.user) {
          throw new Error("anon-sign-in-failed");
        }

        const user = auth.currentUser;
        if (!user) {
          throw new Error("auth-missing-user");
        }

        // Set up demo data
        await ensureDemoData(db, user.uid);

        if (typeof window !== "undefined") {
          enableDemo();
        }

        if (!cancelled) {
          navigate("/coach", { replace: true });
        }
        return true;
      } catch (error) {
        console.error("demo_gate_error", error);
        return false;
      }
    };

    const runWithTimeout = async () => {
      // First attempt
      const firstAttemptPromise = attemptSignIn();
      
      // Set up 6 second timeout
      const timeoutPromise = new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn("demo_gate_timeout: First attempt timed out after 6s");
          resolve(false);
        }, 6000);
      });

      // Race between sign-in and timeout
      const firstResult = await Promise.race([firstAttemptPromise, timeoutPromise]);
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (firstResult) {
        return; // Success on first attempt
      }

      // Second attempt after timeout
      console.log("demo_gate_retry: Attempting sign-in again");
      const secondResult = await attemptSignIn();

      if (!secondResult && !cancelled) {
        // Both attempts failed
        setError(true);
        toast({
          title: "Unable to load demo",
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
      }
    };

    void runWithTimeout();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate, toast]);

  const handleRetry = async () => {
    setError(false);
    setRetrying(true);
    
    try {
      // If currentUser exists, navigate immediately
      if (auth.currentUser) {
        const targetPath = auth.currentUser.isAnonymous ? "/coach" : "/today";
        navigate(targetPath, { replace: true });
        return;
      }

      // Try to sign in
      const credential = await signInAnonymously(auth);
      if (!credential.user) {
        throw new Error("anon-sign-in-failed");
      }

      await ensureDemoData(db, auth.currentUser!.uid);
      enableDemo();
      navigate("/coach", { replace: true });
    } catch (error) {
      console.error("demo_gate_retry_error", error);
      setError(true);
      toast({
        title: "Still unable to load demo",
        description: "Please try again later or contact support.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-center px-4">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Unable to load demo</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            We couldn't sign you in to the demo. Please check your internet connection and try again.
          </p>
        </div>
        <Button 
          onClick={handleRetry} 
          disabled={retrying}
          className="min-w-[120px]"
        >
          {retrying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Retrying...
            </>
          ) : (
            "Try again"
          )}
        </Button>
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
