import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Upload } from "lucide-react";
import { auth } from "@/lib/firebase";
import { startScan, uploadScanFile, runBodyScan, listenToScan } from "@/lib/scan";
import { sanitizeFilename } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import { getAppConfig } from "@/lib/appConfig";
import { grantTestCredits } from "@/lib/callGrantTestCredits";
import { useCredits } from "@/hooks/useCredits";

type Stage = "idle" | "uploading" | "processing";

export default function ScanNew() {
  const [stage, setStage] = useState<Stage>("idle");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { credits } = useCredits();
  const [cfg, setCfg] = React.useState<Awaited<ReturnType<typeof getAppConfig>> | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getAppConfig().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const canShowTestUI = !!cfg?.allowFreeScans;

  const onGetTest = async () => {
    try {
      setBusy(true);
      const res = await grantTestCredits();
      console.info("Test credits granted:", res);
    } catch (e) {
      console.error("grantTestCredits failed", e);
      alert("Could not grant test credits. Are you whitelisted?");
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async () => {
    if (!auth.currentUser) {
      toast({
        title: "Authentication required",
        description: "Please sign in first",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = false;

    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const uid = auth.currentUser!.uid;
      const filename = sanitizeFilename(file.name);
      
      try {
        setStage("uploading");

        // Step 1: Start scan and get scanId
        const { scanId, remaining } = await startScan({
          filename,
          size: file.size,
          contentType: file.type,
        });

        toast({
          title: "Scan started",
          description: `Credits remaining: ${remaining}`,
        });

        // Step 2: Upload file to storage
        await uploadScanFile(uid, scanId, file);

        setStage("processing");

        // Step 3: Trigger backend processing
        await runBodyScan(scanId);

        // Step 4: Listen for completion
        const unsubscribe = listenToScan(
          uid,
          scanId,
          (scan) => {
            if (scan.status === "completed") {
              unsubscribe();
              navigate(`/results/${scanId}`);
            } else if (scan.status === "error") {
              unsubscribe();
              setStage("idle");
              toast({
                title: "Scan failed",
                description: scan.error || "Please try again",
                variant: "destructive",
              });
            }
          },
          (error) => {
            unsubscribe();
            setStage("idle");
            toast({
              title: "Error",
              description: "Failed to monitor scan progress",
              variant: "destructive",
            });
          }
        );

      } catch (error) {
        console.error("Scan error:", error);
        setStage("idle");
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "Please try again",
          variant: "destructive",
        });
      }
    };

    input.click();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Seo
        title="New Scan - MyBodyScan"
        description="Upload a photo or video for body composition analysis"
      />

      {canShowTestUI && (
        <div className="rounded-lg border p-3 text-sm">
          <b>Test mode active:</b> You can grant yourself test credits to try scans without paying.
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold mb-2">New Scan</h1>
        <p className="text-muted-foreground">
          Upload a photo or video to get your body composition analysis
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Your Scan</CardTitle>
          <CardDescription>
            Choose a clear, well-lit photo or video of yourself for the most accurate results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={handleFileUpload}
              disabled={stage !== "idle"}
              className="h-24 flex flex-col gap-2"
              variant="outline"
            >
              <Upload className="h-6 w-6" />
              {stage === "idle" && "Choose File"}
              {stage === "uploading" && "Uploading..."}
              {stage === "processing" && "Processing..."}
            </Button>

            <Button
              onClick={handleFileUpload}
              disabled={stage !== "idle"}
              className="h-24 flex flex-col gap-2"
              variant="outline"
            >
              <Camera className="h-6 w-6" />
              {stage === "idle" && "Use Camera"}
              {stage === "uploading" && "Uploading..."}
              {stage === "processing" && "Processing..."}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>• Use a well-lit area with good contrast</p>
            <p>• Stand 6-8 feet from the camera</p>
            <p>• Wear form-fitting clothing for best results</p>
          </div>
        </CardContent>
      </Card>

      {canShowTestUI && credits === 0 && (
        <button
          onClick={onGetTest}
          disabled={busy}
          className="px-4 py-2 rounded-md border"
        >
          {busy ? "Granting..." : "Get test credits"}
        </button>
      )}
    </div>
  );
}
