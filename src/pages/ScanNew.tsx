import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { startScan } from "@/lib/api";
import { sanitizeFilename } from "@/lib/utils";

const ScanNew = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
      navigate("/auth", { state: { from: "/scan/new" } });
      return;
    }

    setLoading(true);
    try {
      const { scanId } = await startScan({
        filename: file.name,
        size: file.size,
        contentType: file.type,
      });
      const safeExt = sanitizeFilename(file.name).split(".").pop() || "bin";
      const fileRef = ref(storage, `scans/${user.uid}/${scanId}/original.${safeExt}`);
      await uploadBytes(fileRef, file);
      toast({ title: "Upload successful", description: "Processing your scan..." });
      navigate(`/scan/${scanId}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error?.message || "Please try again.",
      });
    } finally {
      setLoading(false);
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
                    {loading ? "Uploading..." : "Choose File"}
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
                    Use Camera
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
