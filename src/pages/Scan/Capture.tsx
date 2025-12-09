import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Seo } from "@/components/Seo";
import ScanCaptureComponent, { type CaptureReady } from "@/features/scan/ScanCapture";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { Button } from "@/components/ui/button";
import { clearCaptureFiles, setCaptureFile, setCaptureSession, type CaptureView } from "./scanCaptureStore";
import type { Pose } from "@/features/scan/poses";

const READY_KEY_TO_VIEW: Record<keyof CaptureReady, CaptureView> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
};

function ensureFile(blob: File | Blob, pose: keyof CaptureReady): File {
  if (blob instanceof File) return blob;
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const extension = type === "image/png" ? "png" : "jpg";
  const timestamp = Date.now();
  return new File([blob], `scan-${pose}-${timestamp}.${extension}`, { type });
}

export default function ScanCapture() {
  const [readyPayload, setReadyPayload] = useState<CaptureReady | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const appCheck = useAppCheckStatus();
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const navigate = useNavigate();
  const scanOffline =
    !scanConfigured ||
    systemHealth?.scanConfigured === false ||
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;
  const blocked = appCheck.status === "missing" || scanOffline;
  const scanPrereqMessage = scanOffline
    ? systemHealth?.openaiConfigured === false || systemHealth?.openaiKeyPresent === false
      ? "Scans require the OpenAI key (OPENAI_API_KEY) to be configured before uploads are enabled."
      : "Scan endpoints are offline until the Cloud Functions base URL is set."
    : null;

  function handleReady(payload: CaptureReady) {
    setReadyPayload(payload);
    setPersistError(null);
    console.log("ScanCapture ready:", payload);
  }

  const handleContinue = () => {
    if (!readyPayload) return;
    setPersisting(true);
    setPersistError(null);
    try {
      clearCaptureFiles();
      setCaptureSession(null);
      (Object.keys(READY_KEY_TO_VIEW) as Array<keyof CaptureReady>).forEach((pose) => {
        const view = READY_KEY_TO_VIEW[pose];
        const source = readyPayload[pose];
        if (!source) {
          throw new Error("missing_photo");
        }
        const file = ensureFile(source, pose);
        setCaptureFile(view, file);
      });
      navigate("/scan/result");
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message !== "missing_photo"
          ? error.message
          : "Unable to prepare your photos. Please try again.";
      setPersistError(message);
    } finally {
      setPersisting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Seo title="Capture Photos – MyBodyScan" description="Upload the four required angles for your scan." />
      <Card>
        <CardHeader>
          <CardTitle>Capture Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {appCheck.status === "checking" ? (
            <Alert className="border-dashed">
              <AlertTitle>Preparing secure upload…</AlertTitle>
              <AlertDescription>
                Waiting for App Check before enabling uploads. This usually takes a few seconds.
              </AlertDescription>
            </Alert>
          ) : null}

          {scanPrereqMessage ? (
            <Alert variant="destructive" className="mb-3">
              <AlertTitle>Scanning service unavailable</AlertTitle>
              <AlertDescription>
                {scanPrereqMessage}
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
          {!blocked ? (
            <ScanCaptureComponent onReady={handleReady} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload controls stay disabled until App Check is ready and the scan service URL is configured.
            </p>
          )}
        </CardContent>
      </Card>
      {readyPayload ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">All poses ready. Continue to upload in the next step.</p>
          {persistError ? <p className="text-sm text-destructive">{persistError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleContinue} disabled={persisting}>
              {persisting ? "Preparing…" : "Continue to preview"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReadyPayload(null);
                setPersistError(null);
              }}
              disabled={persisting}
            >
              Retake photos
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
