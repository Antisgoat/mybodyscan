import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { createScanDraftVideo } from "@/services/placeholders";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";

const MAX_SECONDS = 10;

const VideoCapture = () => {
  const { user } = useAuth();
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
    if (!user || !file || duration == null) return;
    setLoading(true);
    try {
      const { scanId } = await createScanDraftVideo(user.uid, file, duration);
      navigate(`/processing/${user.uid}/${scanId}`);
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
