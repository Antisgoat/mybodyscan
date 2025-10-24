import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth as firebaseAuth, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { startScan } from "@/lib/api";
import { consumeOneCredit } from "@/lib/payments";
import { sanitizeFilename } from "@/lib/utils";

const MAX_SECONDS = 10;

const VideoCapture = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const video = videoRef.current!;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      setDuration(video.duration);
      if (video.duration > MAX_SECONDS) {
        toast({ title: "Video too long", description: `Please keep it under ${MAX_SECONDS}s.` });
        setFile(null);
        setDuration(null);
      }
    };
    video.src = url;
  }, [file]);

  const onContinue = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !file || duration == null) {
      if (!uid) {
        toast({ title: "Sign in required" });
        navigate("/auth", { replace: true });
      }
      return;
    }
    setLoading(true);
    try {
      await consumeOneCredit();
      const { scanId } = await startScan({
        filename: file.name,
        size: file.size,
        contentType: file.type,
      });
      const ext = sanitizeFilename(file.name).split(".").pop() || "mp4";
      const path = `scans/${uid}/${scanId}/original.${ext}`;
      await uploadBytes(ref(storage, path), file);
      navigate(`/scan/${scanId}`);
    } catch (e: any) {
      console.error("VideoCapture error", e);
      if (e?.message === "No credits available") {
        toast({ title: "No credits", description: "Please purchase more" });
        navigate("/plans");
      } else if (e?.code === "permission-denied") {
        toast({ title: "Sign in required" });
        navigate("/auth", { replace: true });
      } else {
        toast({ title: "Failed to create scan", description: e?.message ?? "Try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Record Video – MyBodyScan" description="Record a short video for your body scan." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Record Video</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Hold your phone upright (portrait). Slowly rotate 360° in front of camera. Max {MAX_SECONDS} seconds.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Up to {MAX_SECONDS}s</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative w-full aspect-video overflow-hidden rounded-lg bg-muted">
            <video ref={videoRef} className="h-full w-full object-contain" controls />
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-center">
              <label className="inline-flex">
                <input 
                  type="file" 
                  accept="video/*" 
                  capture="environment" 
                  className="hidden" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  aria-label="Record or choose video file"
                />
                <Button type="button" className="bg-primary hover:bg-primary/90">
                  {file ? "Change Video" : "Choose / Record"}
                </Button>
              </label>
            </div>
          </div>
          <div className="text-center text-sm">
            {duration != null ? (
              <span className={duration <= MAX_SECONDS ? "text-primary" : "text-destructive"}>
                Duration: {duration.toFixed(1)}s {duration > MAX_SECONDS && "(Too long)"}
              </span>
            ) : (
              <span className="text-muted-foreground">No video selected</span>
            )}
          </div>
          <Button 
            className="w-full" 
            onClick={onContinue} 
            disabled={!file || duration == null || duration > MAX_SECONDS || loading}
            aria-label={file && duration != null && duration <= MAX_SECONDS ? "Analyze video" : "Select a valid video first"}
          >
            {loading ? "Creating scan..." : file && duration != null ? "Analyze Video" : "Select Video"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default VideoCapture;
