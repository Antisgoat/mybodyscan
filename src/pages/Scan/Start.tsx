import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

export default function ScanStart() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <Seo title="Start Scan – MyBodyScan" description="Begin your next body scan." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Start a Scan</h1>
        <p className="text-muted-foreground">Get set to capture your next progress photos.</p>
      </div>
      <Button size="lg" onClick={() => navigate("/scan/capture")}>
        Begin scan
      </Button>
    </div>
  );
}
