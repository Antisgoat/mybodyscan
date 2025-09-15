import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import { startScan } from "@/lib/api";
import { consumeOneCredit } from "@/lib/payments";
import { uploadScanFile, processScan, listenToScan } from "@/lib/scan";
import { sanitizeFilename } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";

type Stage = "idle" | "uploading" | "processing";

export default function ScanNew() {
  const isPhotoMode = import.meta.env.VITE_SCAN_MODE === "photos";
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      toast({ title: "Authentication required", variant: "destructive" });
      navigate("/auth");
      return;
    }
    if (!file) {
      toast({ title: "Upload missing" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image." });
      return;
    }

    try {
      setStage("uploading");
      const uid = auth.currentUser.uid;
      const filename = sanitizeFilename(file.name);
      const remaining = await consumeOneCredit();
      const { scanId } = await startScan({
        filename,
        size: file.size,
        contentType: file.type,
      });
      await uploadScanFile(uid, scanId, file);
      setStage("processing");
      await processScan(scanId);
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
        () => {
          unsubscribe();
          setStage("idle");
          toast({ title: "Error", description: "Failed to monitor scan" });
        }
      );
      toast({ title: "Scan started", description: `Credits remaining: ${remaining}` });
    } catch (e: any) {
      setStage("idle");
      if (e?.message === "No credits available") {
        toast({ title: "No credits", description: "Please purchase more" });
        navigate("/plans");
        return;
      }
      const msg =
        e?.message === "deadline-exceeded"
          ? "Scan took too long—please try again."
          : e?.message;
      toast({
        title: "Upload failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  if (!isPhotoMode) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p>Video capture temporarily disabled.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Seo title="New Scan - MyBodyScan" description="Upload a full-body photo for analysis" />
      <div>
        <h1 className="text-3xl font-bold mb-2">New Scan</h1>
        <p className="text-muted-foreground">
          Upload a full-body photo (head-to-toe), neutral background, arms slightly out, tight/minimal clothing.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Upload Photo</CardTitle>
          <CardDescription>Submit one clear full-body image.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
          <Button onClick={handleSubmit} disabled={!file || stage !== "idle"}>
            {stage === "idle" && "Submit"}
            {stage === "uploading" && "Uploading..."}
            {stage === "processing" && "Processing..."}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

