/**
 * Pipeline map — Scan entry routing:
 * - Legacy `/scan-flow` route simply redirects into the main `/scan` upload page so users always hit the current flow.
 * - Keeps SEO metadata for old links while ensuring they land on the `ScanPage` form that drives start→upload→result.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function ScanFlowPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/scan", { replace: true });
  }, [navigate]);

  return (
    <div className="space-y-6">
      <Seo title="Scan Flow" description="Redirecting to the Live Body Scan." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Scan Flow</h1>
        <p className="text-muted-foreground">Redirecting to the latest Live Body Scan experience…</p>
      </div>
    </div>
  );
}
