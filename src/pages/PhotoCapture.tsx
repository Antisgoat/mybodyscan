import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import silhouette from "@/assets/silhouette-front.png";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth as firebaseAuth, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { runBodyScan } from "@/lib/scanLegacy";
import { sanitizeFilename } from "@/lib/utils";

const steps = ["Front", "Left", "Right", "Back"] as const;

type StepKey = "front" | "left" | "right" | "back";

const PhotoCapture = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [files, setFiles] = useState<{ front?: File; left?: File; right?: File; back?: File }>({});
  const [loading, setLoading] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = steps[current].toLowerCase() as StepKey;
    setFiles((f) => ({ ...f, [key]: file }));
  };

  const next = () => setCurrent((c) => Math.min(c + 1, steps.length - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));

  const allSet = files.front && files.left && files.right && files.back;

  const onContinue = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      toast({ title: "Sign in required" });
      navigate("/auth", { replace: true });
      return;
    }
    if (!allSet) {
      toast({ title: "Missing photos", description: "Please capture all 4 sides." });
      return;
    }
    setLoading(true);
    try {
      const uploads: Array<[StepKey, File]> = [
        ["front", files.front!],
        ["left", files.left!],
        ["right", files.right!],
        ["back", files.back!],
      ];
      const paths: string[] = [];
      for (const [key, file] of uploads) {
        const ext = sanitizeFilename(file.name).split(".").pop() || "jpg";
        const path = `uploads/${uid}/${key}.${ext}`;
        await uploadBytes(ref(storage, path), file);
        paths.push(path);
      }
      const { scanId } = await runBodyScan(paths[0]);
      navigate(`/scan/${scanId}`);
    } catch (e: any) {
      console.error("PhotoCapture error", e);
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
      <Seo title="Capture Photos – MyBodyScan" description="Capture four photos to create your body scan." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Capture Photos</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Hold your phone upright (portrait). Stand 3-4 feet away. Capture all four sides clearly.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Step {current + 1}/4 – {steps[current]}
            {allSet && <span className="text-sm font-normal text-primary">✓ All 4 uploaded</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-muted">
            <img src={silhouette} alt="capture silhouette overlay" className="absolute inset-0 h-full w-full object-contain opacity-60 pointer-events-none" loading="lazy" />
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
              <Button variant="secondary" onClick={prev} disabled={current === 0}>Back</Button>
              <label className="inline-flex">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={onPick} 
                  className="hidden"
                  aria-label={`Capture ${steps[current]} photo`}
                />
                <Button type="button" className="bg-primary hover:bg-primary/90">
                  {files[steps[current].toLowerCase() as StepKey] ? "Retake" : "Capture"}
                </Button>
              </label>
              <Button variant="secondary" onClick={next} disabled={current === steps.length - 1}>Next</Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
            {steps.map((s) => {
              const isComplete = !!files[s.toLowerCase() as StepKey];
              return (
                <div 
                  key={s} 
                  className={`rounded-md border p-2 transition-colors ${
                    isComplete
                      ? "border-primary bg-primary/10 text-primary"
                      : "border"
                  }`}
                >
                  {isComplete && <span className="block text-xs">✓</span>}
                  {s}
                </div>
              );
            })}
          </div>
          <Button 
            className="w-full" 
            onClick={onContinue} 
            disabled={!allSet || loading}
            aria-label={allSet ? "Analyze photos" : "Complete all 4 photos first"}
          >
            {loading ? "Creating scan..." : allSet ? "Analyze Photos" : "Complete all 4 photos"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default PhotoCapture;
