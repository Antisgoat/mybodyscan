import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, storage, db } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, onSnapshot } from "firebase/firestore";
import { startScan, authedFetch } from "@/lib/api";
import { sanitizeFilename } from "@/lib/utils";

const ScanNew = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const loading = stage !== 'idle';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
      navigate("/auth", { state: { from: "/scan/new" } });
      return;
    }

    setStage('uploading');
    try {
      const { scanId } = await startScan({
        filename: file.name,
        size: file.size,
        contentType: file.type,
      });
      const safeExt = sanitizeFilename(file.name).split(".").pop() || "bin";
      const fileRef = ref(storage, `scans/${user.uid}/${scanId}/original.${safeExt}`);
      await uploadBytes(fileRef, file);
      setStage('processing');
      const resp = await authedFetch('/processQueuedScanHttp', {
        method: 'POST',
        body: JSON.stringify({ uid: user.uid, scanId }),
      });
      if (resp.status === 401 || resp.status === 403) {
        toast({ title: 'Not authorized', description: 'Please sign in again.' });
        setStage('idle');
        return;
      }
      toast({ title: 'Upload successful', description: 'Processing your scan...' });
      const scanRef = doc(db, 'users', user.uid, 'scans', scanId);
      await new Promise<void>((resolve, reject) => {
        const unsub = onSnapshot(
          scanRef,
          (snap) => {
            const status: any = snap.data()?.status;
            if (status === 'completed') {
              unsub();
              resolve();
            } else if (status === 'error') {
              unsub();
              reject(new Error('processing failed'));
            }
          },
          (err) => reject(err)
        );
      });
      navigate(`/scan/${scanId}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error?.message || "Please try again.",
      });
    } finally {
      setStage('idle');
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo
        title="New Scan – MyBodyScan"
        description="Upload a photo or video to start your body scan analysis."
        canonical={window.location.href}
      />

      <h1 className="text-2xl font-semibold mb-6">Start New Scan</h1>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Upload Photo/Video</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="hidden"
                />
                <Button
                  variant="default"
                  className="w-full"
                  disabled={loading}
                  asChild
                >
                  <span className="cursor-pointer">
                    {stage === 'uploading'
                      ? 'Uploading...'
                      : stage === 'processing'
                      ? 'Processing...'
                      : 'Choose File'}
                  </span>
                </Button>
              </label>
            </div>

            <div className="text-center text-sm text-muted-foreground">or</div>

            <div>
              <label className="block">
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  asChild
                >
                  <span className="cursor-pointer">
                    {stage === 'uploading'
                      ? 'Uploading...'
                      : stage === 'processing'
                      ? 'Processing...'
                      : 'Use Camera'}
                  </span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ScanNew;
