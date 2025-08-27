import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const Processing = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("queued");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !scanId) return;
    const ref = doc(db, "users", uid, "scans", scanId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data: any = snap.data();
        const s = data?.status ?? "queued";
        setStatus(s);
        if (s === "done") {
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
  }, [scanId, navigate]);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center">
      <Seo title="Processing – MyBodyScan" description="Analyzing your scan (about 1–2 minutes)." canonical={window.location.href} />
      <div className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin" aria-label="Loading" />
      <h1 className="mt-6 text-2xl font-semibold">Analyzing your scan</h1>
      <p className="text-muted-foreground mt-2">This can take ~1–2 minutes.</p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 bg-secondary text-secondary-foreground">
        <span className="h-2 w-2 rounded-full bg-warning" />
        <span className="text-sm">{status}</span>
      </div>
      {status === "error" && (
        <Button variant="secondary" className="mt-8" onClick={() => navigate("/scan/new")}>Retry</Button>
      )}
    </main>
  );
};

export default Processing;
