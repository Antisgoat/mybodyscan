import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, db, storage } from "@/lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

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
      const scanId = uuidv4();
      
      // Upload file to storage
      const fileRef = ref(storage, `scans/${user.uid}/${scanId}/${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);
      
      // Create scan document
      const scanRef = doc(collection(db, "users", user.uid, "scans"), scanId);
      await setDoc(scanRef, {
        uid: user.uid,
        status: "processing",
        fileUrl: downloadURL,
        fileType: file.type,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Upload successful", description: "Processing your scan..." });
      navigate(`/scan/${scanId}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ 
        title: "Upload failed", 
        description: error?.message || "Please try again." 
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