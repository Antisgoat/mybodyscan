import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function PhotoCapture() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/scan", { replace: true });
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Seo title="Redirecting to Live Scan" description="Redirecting to the latest scan experience." />
      <p className="text-sm text-muted-foreground">Redirecting to the Live Body Scan experience…</p>
    </main>
  );
}
