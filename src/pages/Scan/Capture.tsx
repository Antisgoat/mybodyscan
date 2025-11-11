import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import ScanCaptureComponent, { type CaptureReady } from "@/features/scan/ScanCapture";

export default function ScanCapture() {
  const [readyPayload, setReadyPayload] = useState<CaptureReady | null>(null);

  function handleReady(payload: CaptureReady) {
    setReadyPayload(payload);
    console.log("ScanCapture ready:", payload);
  }

  return (
    <div className="space-y-6">
      <Seo title="Capture Photos – MyBodyScan" description="Upload the four required angles for your scan." />
      <Card>
        <CardHeader>
          <CardTitle>Capture Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <ScanCaptureComponent onReady={handleReady} />
        </CardContent>
      </Card>
      {readyPayload ? (
        <p className="text-sm text-muted-foreground">
          All poses ready. Continue to upload in the next step.
        </p>
      ) : null}
    </div>
  );
}
