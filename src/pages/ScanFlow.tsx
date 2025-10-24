import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import ScanFlow from "../components/ScanFlow";

export default function ScanFlowPage() {
  return (
    <div className="space-y-6">
      <Seo title="Scan Flow" description="Upload a file to run the full scan pipeline." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Scan Flow</h1>
        <p className="text-muted-foreground">
          Upload an image or short video to start a scan session, then track progress until results are ready.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Run a scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanFlow />
        </CardContent>
      </Card>
    </div>
  );
}
