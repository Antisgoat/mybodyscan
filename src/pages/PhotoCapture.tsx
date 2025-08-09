import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { createScanDraftPhotos } from "@/services/placeholders";
import { useNavigate } from "react-router-dom";
import silhouette from "@/assets/silhouette-front.png";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";

const steps = ["Front", "Left", "Right", "Back"] as const;

type StepKey = "front" | "left" | "right" | "back";

const PhotoCapture = () => {
  const { user } = useAuth();
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
    if (!user) return;
    if (!allSet) {
      toast({ title: "Missing photos", description: "Please capture all 4 sides." });
      return;
    }
    setLoading(true);
    try {
      const { scanId } = await createScanDraftPhotos(user.uid, {
        front: files.front!,
        left: files.left!,
        right: files.right!,
        back: files.back!,
      });
      navigate(`/processing/${user.uid}/${scanId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Capture Photos – MyBodyScan" description="Capture four photos to create your body scan." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Capture Photos</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            Step {current + 1}/4 – {steps[current]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-muted">
            <img src={silhouette} alt="capture silhouette overlay" className="absolute inset-0 h-full w-full object-contain opacity-60 pointer-events-none" loading="lazy" />
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
              <Button variant="secondary" onClick={prev} disabled={current === 0}>Back</Button>
              <label className="inline-flex">
                <input type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
                <Button type="button">Capture</Button>
              </label>
              <Button variant="secondary" onClick={next} disabled={current === steps.length - 1}>Next</Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
            {steps.map((s) => (
              <div key={s} className={`rounded-md border p-2 ${files[s.toLowerCase() as StepKey] ? "border-primary" : "border-border"}`}>
                {s}
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={onContinue} disabled={!allSet || loading}>
            {loading ? "Creating scan..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default PhotoCapture;
