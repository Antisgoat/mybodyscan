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
