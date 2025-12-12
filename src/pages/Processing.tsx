import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthUser } from "@/lib/auth";
import { useBackNavigationGuard } from "@/lib/back";

const Processing = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("queued");
  const { user } = useAuthUser();
  const [showTip, setShowTip] = useState(false);
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
            Something went wrong during processing. Please try again.
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate("/scan/new")}
            aria-label="Start a new scan"
          >
            Try Again
          </Button>
        </div>
      )}
    </main>
  );
};

export default Processing;
