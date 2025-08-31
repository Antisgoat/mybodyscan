import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { startScan } from "@/lib/api";
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
    const uid = auth.currentUser?.uid;
    if (!uid || !file || duration == null) {
      if (!uid) {
        toast({ title: "Sign in required" });
        navigate("/auth", { replace: true });
      }
      return;
    }
    setLoading(true);
    try {
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
      if (e?.code === "permission-denied") {
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
      <Card>
        <CardHeader>
          <CardTitle>Up to {MAX_SECONDS}s</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative w-full aspect-video overflow-hidden rounded-lg bg-muted">
            <video ref={videoRef} className="h-full w-full object-contain" controls />
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-center">
              <label className="inline-flex">
                <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <Button type="button">Choose / Record</Button>
              </label>
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {duration != null ? `Duration: ${duration.toFixed(1)}s` : "No video selected"}
          </div>
          <Button className="w-full" onClick={onContinue} disabled={!file || duration == null || loading}>
            {loading ? "Creating scan..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default VideoCapture;
