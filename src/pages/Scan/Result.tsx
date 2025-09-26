import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { useUserProfile } from "@/hooks/useUserProfile";
import { estimateBodyComp } from "@/lib/estimator";
import type { ViewName, PhotoFeatures } from "@/lib/vision/features";
import { combineLandmarks } from "@/lib/vision/features";
import type { Landmarks } from "@/lib/vision/landmarks";
import { analyzePhoto } from "@/lib/vision/landmarks";
import { cmToIn, kgToLb } from "@/lib/units";
import { getLastWeight } from "@/lib/userState";
import { CAPTURE_VIEW_SETS, type CaptureView, useScanCaptureStore } from "./scanCaptureStore";

const VIEW_NAME_MAP: Record<CaptureView, ViewName> = {
  Front: "front",
  Side: "side",
  Back: "back",
  Left: "left",
  Right: "right",
};

function formatDecimal(value: number | null | undefined): string | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const numeric = value as number;
  return numeric.toFixed(1);
}

export default function ScanFlowResult() {
  const { mode, files } = useScanCaptureStore();
  const { profile } = useUserProfile();
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineForm, setRefineForm] = useState({ neck: "", waist: "", hip: "" });
  const [photoFeatures, setPhotoFeatures] = useState<PhotoFeatures | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastWeight] = useState<number | null>(() => getLastWeight());

  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const capturedShots = useMemo(
    () => shots.filter((view) => Boolean(files[view])),
    [shots, files],
  );
  const allCaptured = capturedShots.length === shots.length;

  useEffect(() => {
    let cancelled = false;
    const tasks = shots
      .map((view) => {
        const file = files[view];
        if (!file) return null;
        return { key: VIEW_NAME_MAP[view], file };
      })
      .filter((entry): entry is { key: ViewName; file: File } => Boolean(entry));

    if (!tasks.length) {
      setPhotoFeatures(null);
      setAnalysisError(null);
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    (async () => {
      try {
        const results = await Promise.all(
          tasks.map(async ({ key, file }) => ({ key, data: await analyzePhoto(file, key) })),
        );
        if (cancelled) return;

        const views: Partial<Record<ViewName, Landmarks>> = {};
        for (const result of results) {
          views[result.key] = result.data;
        }
        const combined = combineLandmarks(views.front, views.side, views.left, views.right, views.back);
        setPhotoFeatures(combined);
        setAnalyzing(false);
      } catch (error) {
        console.error("analyzePhoto", error);
        if (cancelled) return;
        setAnalysisError("Could not analyze photos.");
        setPhotoFeatures(null);
        setAnalyzing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files, shots]);

  const sex = profile?.sex === "male" || profile?.sex === "female" ? profile.sex : undefined;
  const age = profile?.age && Number.isFinite(profile.age) ? profile.age : undefined;
  const heightIn = profile?.height_cm ? cmToIn(profile.height_cm) : undefined;
  const profileWeightLb = profile?.weight_kg ? kgToLb(profile.weight_kg) : undefined;
  const weightLb = lastWeight ?? profileWeightLb ?? undefined;

  const estimate = useMemo(() => {
    if (!photoFeatures) return null;
    if (!heightIn || !sex) return null;
    return estimateBodyComp({
      sex,
      age,
      heightIn,
      weightLb: weightLb ?? undefined,
      photoFeatures,
    });
  }, [age, heightIn, photoFeatures, sex, weightLb]);

  const bodyFatValue = formatDecimal(estimate?.bodyFatPct ?? null);
  const bmiValue = formatDecimal(estimate?.bmi ?? null);
  const weightValue = formatDecimal((estimate?.usedWeight ?? weightLb) ?? null);

  const estimateStatus = useMemo(() => {
    if (analysisError) return analysisError;
    if (analyzing) return "Analyzing photos…";
    if (!allCaptured) return "Capture every required angle to analyze the scan.";
    if (!heightIn || !sex) return "Add your height and sex in Settings to unlock the preview.";
    if (!bodyFatValue) return "Add your weight to see the full estimate.";
    return "Scan preview based on your latest photos.";
  }, [analysisError, analyzing, allCaptured, heightIn, sex, bodyFatValue]);

  return (
    <div className="space-y-6">
      <Seo title="Scan Result Preview – MyBodyScan" description="Review the draft estimate before finalizing." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Preview Result</h1>
        <p className="text-muted-foreground">{estimateStatus}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Estimated body metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-sm text-muted-foreground">Estimated Body Fat</p>
              <p className="text-3xl font-semibold">{bodyFatValue ? `${bodyFatValue}%` : "—"}</p>
            </div>
            <p className="text-sm">
              Estimated BMI: {bmiValue ?? "—"} · Weight: {weightValue ? `${weightValue} lb` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Estimates only. Not a medical diagnosis.</p>
            <Dialog open={refineOpen} onOpenChange={setRefineOpen}>
              <DialogTrigger asChild>
                <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Refine measurements
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Refine estimate</DialogTitle>
                  <DialogDescription>Enter manual measurements to update the result preview.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="refine-neck">Neck (in)</Label>
                    <Input
                      id="refine-neck"
                      type="number"
                      min="0"
                      step="0.1"
                      value={refineForm.neck}
                      onChange={(event) => setRefineForm((prev) => ({ ...prev, neck: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refine-waist">Waist (in)</Label>
                    <Input
                      id="refine-waist"
                      type="number"
                      min="0"
                      step="0.1"
                      value={refineForm.waist}
                      onChange={(event) => setRefineForm((prev) => ({ ...prev, waist: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refine-hip">Hip (in)</Label>
                    <Input
                      id="refine-hip"
                      type="number"
                      min="0"
                      step="0.1"
                      value={refineForm.hip}
                      onChange={(event) => setRefineForm((prev) => ({ ...prev, hip: event.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRefineOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled>Save adjustments</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium">Captured photos</h2>
            <ul className="space-y-2">
              {shots.map((view) => {
                const file = files[view];
                return (
                  <li key={view} className="flex items-center justify-between rounded-md border p-3">
                    <span className="font-medium">{view}</span>
                    {file ? (
                      <span className="text-sm text-muted-foreground">
                        {file.name} · {(file.size / 1024).toFixed(0)} KB
                      </span>
                    ) : (
                      <span className="text-sm text-destructive">Missing</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
