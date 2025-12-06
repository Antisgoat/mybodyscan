import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Seo } from "@/components/Seo";
import ScanCaptureComponent, { type CaptureReady } from "@/features/scan/ScanCapture";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";

export default function ScanCapture() {
  const [readyPayload, setReadyPayload] = useState<CaptureReady | null>(null);
  const appCheck = useAppCheckStatus();
  const functionsConfigured = Boolean(
    (import.meta.env.VITE_FUNCTIONS_URL ?? "").trim() || (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "").trim(),
  );
  const blocked = appCheck.status === "missing" || !functionsConfigured;

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
          {appCheck.status === "checking" ? (
            <p className="text-sm text-muted-foreground">Preparing secure upload…</p>
          ) : null}
          {!functionsConfigured ? (
            <Alert variant="destructive" className="mb-3">
              <AlertTitle>Scanning service unavailable</AlertTitle>
              <AlertDescription>
                The scan service URL is not configured. Add VITE_FUNCTIONS_URL to continue.
              </AlertDescription>
            </Alert>
          ) : null}
          {appCheck.status === "missing" ? (
            <Alert variant="destructive" className="mb-3">
              <AlertTitle>App Check required</AlertTitle>
              <AlertDescription>
                Secure uploads are blocked because App Check is not available. Refresh the page or contact support.
              </AlertDescription>
            </Alert>
          ) : null}
          {!blocked && <ScanCaptureComponent onReady={handleReady} />}
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
