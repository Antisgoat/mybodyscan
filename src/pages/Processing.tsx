import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthUser } from "@/auth/mbs-auth";
import { useBackNavigationGuard } from "@/lib/back";
import { retryScanProcessingClient } from "@/lib/api/scan";
import { normalizeScanStatus } from "@/lib/scanContract";

const Processing = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<
    "queued" | "processing" | "complete" | "error"
  >("queued");
  const { user } = useAuthUser();
  const [showTip, setShowTip] = useState(false);
  const [lastStep, setLastStep] = useState<string | null>(null);
  const [lastUpdatedAtMs, setLastUpdatedAtMs] = useState<number | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [watchdog, setWatchdog] = useState<{
    triggered: boolean;
    sinceMs?: number;
  }>({ triggered: false });
  const [hardTimeout, setHardTimeout] = useState<{
    triggered: boolean;
    sinceMs?: number;
  }>({ triggered: false });
  const lastUpdatedAtRef = useRef<number | null>(null);
  const canonical =
    typeof window !== "undefined" ? window.location.href : undefined;
  useBackNavigationGuard(() => status === "queued" || status === "processing", {
    message: "Going back may cancel the current action. Continue?",
  });

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !scanId) return;
    const ref = doc(db, "users", uid, "scans", scanId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data: any = snap.data();
        const normalized = normalizeScanStatus(data?.status);
        setStatus(normalized);
        setRefunded(Boolean(data?.refundedAt || data?.creditRefunded));
        setLastStep(typeof data?.lastStep === "string" ? data.lastStep : null);
        const updatedAtRaw = data?.updatedAt ?? data?.lastStepAt ?? null;
        let updatedAtMs: number | null = null;
        try {
          if (updatedAtRaw && typeof updatedAtRaw?.toDate === "function") {
            updatedAtMs = updatedAtRaw.toDate().getTime();
          } else if (typeof updatedAtRaw === "string") {
            const parsed = Date.parse(updatedAtRaw);
            updatedAtMs = Number.isFinite(parsed) ? parsed : null;
          } else if (updatedAtRaw instanceof Date) {
            updatedAtMs = updatedAtRaw.getTime();
          }
        } catch {
          updatedAtMs = null;
        }
        if (typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)) {
          setLastUpdatedAtMs(updatedAtMs);
          lastUpdatedAtRef.current = updatedAtMs;
        }
        if (normalized === "complete") {
          navigate(`/results/${scanId}`, { replace: true });
        }
        if (normalized === "error") {
          navigate(`/scans/${scanId}`, { replace: true });
        }
      },
      (err) => {
        console.error("Processing snapshot error", err);
        if ((err as any)?.code === "permission-denied") {
          toast({ title: "Sign in required" });
          navigate("/auth", { replace: true });
        }
      }
    );
    return () => unsub();
  }, [scanId, navigate, user]);

  const isActiveProcessing = useMemo(() => {
    return status === "processing" || status === "queued";
  }, [status]);

  useEffect(() => {
    if (!isActiveProcessing) {
      setWatchdog({ triggered: false });
      setHardTimeout({ triggered: false });
      return;
    }
    const MAX_ACTIVE_MS = 5 * 60 * 1000;
    const check = () => {
      const updatedAt = lastUpdatedAtRef.current;
      if (!updatedAt) return;
      const age = Date.now() - updatedAt;
      if (age >= 90_000) {
        setWatchdog({ triggered: true, sinceMs: age });
      }
      if (age >= MAX_ACTIVE_MS) {
        setHardTimeout({ triggered: true, sinceMs: age });
      }
    };
    const interval = window.setInterval(check, 1500);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    const onOnline = () => check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [isActiveProcessing]);

  useEffect(() => {
    if (status === "processing" || status === "queued") {
      const timer = window.setTimeout(() => setShowTip(true), 60_000);
      return () => window.clearTimeout(timer);
    }
    setShowTip(false);
    return () => undefined;
  }, [status]);

  const retryProcessing = async () => {
    if (!scanId) return;
    const result = await retryScanProcessingClient(scanId);
    if (result.ok) {
      toast({
        title: "Retry started",
        description: "Processing restarted. We’ll keep updating automatically.",
      });
      setHardTimeout({ triggered: false });
      setWatchdog({ triggered: false });
      setStatus("processing");
      return;
    }
    toast({
      title: "Retry failed",
      description: result.error.message,
      variant: "destructive",
    });
  };

  if (status === "error") {
    return (
      <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto flex items-center justify-center">
        <Seo
          title="Scan recovery – MyBodyScan"
          description="Recover a failed scan."
          canonical={canonical}
        />
        <Card className="w-full border-destructive/30 bg-destructive/5">
          <CardHeader className="space-y-2">
            <CardTitle>We could not complete this scan</CardTitle>
            <p className="text-sm text-muted-foreground">
              No estimate was created for this scan. Please retry processing or
              re-upload the scan photos.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {refunded ? (
              <div className="rounded-lg border bg-background/80 p-3 text-sm text-muted-foreground">
                Your scan credit has been returned.
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button onClick={retryProcessing}>Retry processing</Button>
              <Button variant="outline" onClick={() => navigate("/scan")}>
                Re-upload scan
              </Button>
              <Button variant="outline" onClick={() => navigate("/history")}>
                Scan history
              </Button>
              <Button variant="outline" onClick={() => navigate("/support")}>
                Contact support
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We do not display body fat, macros, body age, scores, or workout
              prescriptions unless the analysis succeeds.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center">
      <Seo
        title="Processing – MyBodyScan"
        description="Analyzing your scan (about 1–2 minutes)."
        canonical={canonical}
      />
      <div
        className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin"
        aria-label="Processing scan"
      />
      <h1 className="mt-6 text-2xl font-semibold">Analyzing your scan</h1>
      <p className="text-muted-foreground mt-2">This can take ~1–2 minutes.</p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 bg-secondary text-secondary-foreground">
        <span
          className={`h-2 w-2 rounded-full ${
            status === "complete"
              ? "bg-primary"
              : status === "error"
                ? "bg-destructive"
                : "bg-warning animate-pulse"
          }`}
        />
        <span className="text-sm font-medium">
          {status === "queued"
            ? "In queue..."
            : status === "processing"
              ? "Processing..."
              : status === "complete"
                ? "Complete!"
                : status === "error"
                  ? "Failed"
                  : status}
        </span>
      </div>
      {showTip && (
        <p className="mt-4 text-sm text-muted-foreground">
          This can take a bit. You can navigate; we’ll update automatically.
        </p>
      )}

      {watchdog.triggered && isActiveProcessing && !hardTimeout.triggered && (
        <div className="mt-8 w-full max-w-sm space-y-3 rounded border p-4 text-center">
          <p className="text-sm font-medium">Still working…</p>
          <p className="text-xs text-muted-foreground">
            No status update for{" "}
            {watchdog.sinceMs
              ? `${Math.round(watchdog.sinceMs / 1000)}s`
              : "a while"}
            . You can retry processing without re-uploading.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={retryProcessing}>
              Retry processing
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
            <Button variant="outline" onClick={() => navigate("/scan")}>
              Back to Scan
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Updated:{" "}
            {lastUpdatedAtMs
              ? new Date(lastUpdatedAtMs).toLocaleTimeString()
              : "—"}
          </p>
        </div>
      )}

      {hardTimeout.triggered && isActiveProcessing && (
        <div className="mt-8 w-full max-w-sm space-y-3 rounded border border-destructive/40 bg-destructive/5 p-4 text-center">
          <p className="text-sm font-medium">This is taking too long</p>
          <p className="text-xs text-muted-foreground">
            No update for{" "}
            {hardTimeout.sinceMs
              ? `${Math.round(hardTimeout.sinceMs / 1000)}s`
              : "a while"}
            . We won’t keep you stuck on this screen.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={retryProcessing}>
              Retry processing
            </Button>
            <Button variant="outline" onClick={() => navigate("/scan")}>
              Start new scan
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Updated:{" "}
            {lastUpdatedAtMs
              ? new Date(lastUpdatedAtMs).toLocaleTimeString()
              : "—"}
            {lastStep ? ` · ${lastStep}` : ""}
          </p>
        </div>
      )}
    </main>
  );
};

export default Processing;
