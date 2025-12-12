/**
 * Pipeline map — Scan entry aliases:
 * - Older marketing routes land here; we send them directly to `/scan` so the same upload/session logic runs.
 * - Keeps metadata in place for bookmarks while maintaining a single implementation of the scan flow.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function ScanNew() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/scan", { replace: true });
  }, [navigate]);

  return (
    <div className="space-y-6">
      <Seo title="Body Scan" description="Redirecting to the Live Body Scan." />
      <h1 className="text-3xl font-semibold">Body Scan</h1>
      <p className="text-muted-foreground">
        Redirecting to the updated scanning workflow…
      </p>
    </div>
  );
}
