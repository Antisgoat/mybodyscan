import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { enableDemo } from "@/lib/demoFlag";

export default function DemoRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    enableDemo();
    if (typeof window === "undefined") {
      navigate("/today?demo=1", { replace: true });
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("demo") !== "1") {
      const next = new URL(window.location.href);
      next.searchParams.set("demo", "1");
      navigate(`${next.pathname}${next.search}${next.hash}`, { replace: true });
      return;
    }
    navigate("/today?demo=1", { replace: true });
  }, [location.search, navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Seo title="Demo – MyBodyScan" description="Loading the MyBodyScan demo experience." />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Loading demo experience…</h1>
        <p className="text-sm text-muted-foreground">
          Redirecting to Today with read-only sample data.
        </p>
      </div>
    </main>
  );
}
