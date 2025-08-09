import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getScan } from "@/services/placeholders";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

const Processing = () => {
  const { uid, scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("queued");

  useEffect(() => {
    const iv = setInterval(async () => {
      if (!uid || !scanId) return;
      const s = await getScan(uid, scanId);
      if (!s) return;
      setStatus(s.status);
      if (s.status === "done") {
        clearInterval(iv);
        navigate(`/results/${uid}/${scanId}`);
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [uid, scanId, navigate]);

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
      <Button variant="secondary" className="mt-8" onClick={() => navigate("/capture")}>Retry</Button>
    </main>
  );
};

export default Processing;
