import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DEMO_SESSION_KEY, enableDemo } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { demoLatestScan, demoScanHistory } from "@/lib/demoDataset";

export default function DemoGate() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      try {
        setFailed(false);
        setLoading(true);

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
            (window as any).__MBS_DEMO__ = {
              latestResult: demoLatestScan,
              history: demoScanHistory,
            };
          } catch (err) {
            console.warn("[demo] unable to persist session flag", err);
          }
        }

        enableDemo();

        if (mountedRef.current) navigate("/home?demo=1", { replace: true });
      } catch (error: any) {
        console.error("demo_gate_error", error);
        if (mountedRef.current) {
          toast({
            title: "Unable to start demo",
            description: "Please try again.",
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
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Loading demo…</p>
        </>
      )}
      {!loading && failed && (
        <>
          <p className="text-sm text-muted-foreground">
            We couldn’t start demo right now.
          </p>
          <Button
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </>
      )}
      {!loading && !failed && (
        <>
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Starting demo…</p>
        </>
      )}
    </div>
  );
}
