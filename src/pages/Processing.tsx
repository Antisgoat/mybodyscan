import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthUser } from "@/lib/auth";
import { useBackNavigationGuard } from "@/lib/back";
import { retryScanProcessingClient } from "@/lib/api/scan";

const Processing = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("queued");
  const { user } = useAuthUser();
  const [showTip, setShowTip] = useState(false);
  const [lastStep, setLastStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [lastUpdatedAtMs, setLastUpdatedAtMs] = useState<number | null>(null);
  const [watchdog, setWatchdog] = useState<{
    triggered: boolean;
    sinceMs?: number;
  }>({ triggered: false });
  const lastUpdatedAtRef = useRef<number | null>(null);
  const canonical =
    typeof window !== "undefined" ? window.location.href : undefined;
  useBackNavigationGuard(
    () =>
      status === "queued" || status === "processing" || status === "pending",
    {
      message: "Going back may cancel the current action. Continue?",
    }
  );

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !scanId) return;
    const ref = doc(db, "users", uid, "scans", scanId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data: any = snap.data();
        const rawStatus =
          typeof data?.status === "string"
            ? data.status.toLowerCase()
            : "queued";
        const normalized =
          rawStatus === "completed" ||
          rawStatus === "complete" ||
          rawStatus === "done"
            ? "complete"
            : rawStatus;
        setStatus(normalized);
        setLastStep(typeof data?.lastStep === "string" ? data.lastStep : null);
        setErrorMessage(
          typeof data?.errorMessage === "string" ? data.errorMessage : null
        );
        setErrorReason(
          typeof data?.errorReason === "string" ? data.errorReason : null
        );
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
    return status === "processing" || status === "queued" || status === "pending";
  }, [status]);

  useEffect(() => {
    if (!isActiveProcessing) {
      setWatchdog({ triggered: false });
      return;
    }
    const interval = window.setInterval(() => {
      const updatedAt = lastUpdatedAtRef.current;
      if (!updatedAt) return;
      const age = Date.now() - updatedAt;
      if (age >= 90_000) {
        setWatchdog({ triggered: true, sinceMs: age });
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [isActiveProcessing]);

  useEffect(() => {
    if (
      status === "processing" ||
      status === "queued" ||
      status === "pending"
    ) {
      const timer = window.setTimeout(() => setShowTip(true), 60_000);
      return () => window.clearTimeout(timer);
    }
    setShowTip(false);
    return () => undefined;
  }, [status]);

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
            : status === "pending"
              ? "Preparing..."
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
      {status === "error" && (
        <div className="mt-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            {errorMessage
              ? errorMessage
              : "Something went wrong during processing. Please try again."}
          </p>
          {errorReason ? (
            <p className="text-xs text-muted-foreground">
              reason: {errorReason}
            </p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => navigate("/scan/new")}
            aria-label="Start a new scan"
          >
            Try Again
          </Button>
        </div>
      )}

      {watchdog.triggered && isActiveProcessing && (
        <div className="mt-8 w-full max-w-sm space-y-3 rounded border p-4 text-center">
          <p className="text-sm font-medium">Still working…</p>
          <p className="text-xs text-muted-foreground">
            No status update for{" "}
            {watchdog.sinceMs ? `${Math.round(watchdog.sinceMs / 1000)}s` : "a while"}.
            You can retry processing without re-uploading.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!scanId) return;
                const result = await retryScanProcessingClient(scanId);
                if (result.ok) {
                  toast({
                    title: "Retry started",
                    description: "Processing restarted. Keep this tab open.",
                  });
                  setWatchdog({ triggered: false });
                  return;
                }
                toast({
                  title: "Retry failed",
                  description: result.error.message,
                  variant: "destructive",
                });
              }}
            >
              Retry processing
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/scan")}
            >
              Back to Scan
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            lastStep: {lastStep ?? "—"} · updatedAt:{" "}
            {lastUpdatedAtMs ? new Date(lastUpdatedAtMs).toLocaleTimeString() : "—"}
          </p>
        </div>
      )}
    </main>
  );
};

export default Processing;
