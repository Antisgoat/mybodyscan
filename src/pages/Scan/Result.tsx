import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReferenceChart } from "@/components/ReferenceChart";
import { Seo } from "@/components/Seo";
import { useUserProfile } from "@/hooks/useUserProfile";
import { estimateBodyComp } from "@/lib/estimator";
import type { ViewName, PhotoFeatures } from "@/lib/vision/features";
import { combineLandmarks } from "@/lib/vision/features";
import type { Landmarks } from "@/lib/vision/landmarks";
import { analyzePhoto } from "@/lib/vision/landmarks";
import { cmToIn, kgToLb, lbToKg, CM_PER_IN } from "@/lib/units";
import { getLastWeight } from "@/lib/userState";
import { findRangeForValue, getSexAgeBands, type LabeledRange } from "@/content/referenceRanges";
import { auth, db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { CAPTURE_VIEW_SETS, type CaptureView, useScanCaptureStore } from "./scanCaptureStore";
import { RefineMeasurementsForm } from "./Refine";
import { setPhotoCircumferences, useScanRefineStore } from "./scanRefineStore";
import type { ManualCircumferences } from "./scanRefineStore";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { useUnits } from "@/hooks/useUnits";

const VIEW_NAME_MAP: Record<CaptureView, ViewName> = {
  Front: "front",
  Side: "side",
  Back: "back",
  Left: "left",
  Right: "right",
};

type PhotoMetadata = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
};

function formatDecimal(value: number | null | undefined): string | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const numeric = value as number;
  return numeric.toFixed(1);
}

async function createThumbnailDataUrl(file: File, maxSize = 128): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () => {
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function toInches(value?: number | null, scale?: number | null): number | undefined {
  if (!Number.isFinite(value ?? NaN) || !Number.isFinite(scale ?? NaN)) {
    return undefined;
  }
  if (!value || value <= 0 || !scale || scale <= 0) {
    return undefined;
  }
  return value * (scale as number);
}

function parseManualCircumference(value: string, units: "us" | "metric"): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return units === "metric" ? parsed / CM_PER_IN : parsed;
}

export default function ScanFlowResult() {
  const { mode, files } = useScanCaptureStore();
  const { profile } = useUserProfile();
  const [refineOpen, setRefineOpen] = useState(false);
  const { manualInputs, photoCircumferences } = useScanRefineStore();
  const [photoFeatures, setPhotoFeatures] = useState<PhotoFeatures | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastWeight] = useState<number | null>(() => getLastWeight());
  const [saving, setSaving] = useState(false);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const appCheck = useAppCheckStatus();
  const { units } = useUnits();
  const functionsConfigured = Boolean(
    (import.meta.env.VITE_FUNCTIONS_URL ?? "").trim() || (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "").trim(),
  );

  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const capturedShots = useMemo(
    () => shots.filter((view) => Boolean(files[view])),
    [shots, files],
  );
  const allCaptured = capturedShots.length === shots.length;

  const tasks = useMemo(
    () =>
      shots
        .map((view) => {
          const file = files[view];
          if (!file) return null;
          return { key: VIEW_NAME_MAP[view], file };
        })
        .filter((entry): entry is { key: ViewName; file: File } => Boolean(entry)),
    [shots, files],
  );

  useEffect(() => {
    let cancelled = false;

    if (!tasks.length || !allCaptured) {
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
  }, [tasks, allCaptured]);


  const sex = profile?.sex === "male" || profile?.sex === "female" ? profile.sex : undefined;
  const age = profile?.age && Number.isFinite(profile.age) ? profile.age : undefined;
  const heightIn = profile?.height_cm ? cmToIn(profile.height_cm) : undefined;
  const profileWeightLb = profile?.weight_kg ? kgToLb(profile.weight_kg) : undefined;
  const weightLb = lastWeight ?? profileWeightLb ?? undefined;

  useEffect(() => {
    if (!photoFeatures || !heightIn) {
      setPhotoCircumferences(null);
      return;
    }

    const averages = photoFeatures.averages;
    const heightPixels = averages?.heightPixels;
    if (!Number.isFinite(heightPixels ?? NaN) || (heightPixels as number) <= 0) {
      setPhotoCircumferences(null);
      return;
    }

    const scale = heightIn / (heightPixels as number);
    const neckIn = toInches(averages?.neckWidth, scale);
    const waistIn = toInches(averages?.waistWidth, scale);
    const hipIn = toInches(averages?.hipWidth, scale);
    setPhotoCircumferences({ neckIn, waistIn, hipIn });
  }, [photoFeatures, heightIn]);

  const manualCircumferences = useMemo<ManualCircumferences | null>(() => {
    const neckIn = parseManualCircumference(manualInputs.neck, units);
    const waistIn = parseManualCircumference(manualInputs.waist, units);
    const hipIn = parseManualCircumference(manualInputs.hip, units);
    if (neckIn == null && waistIn == null && hipIn == null) {
      return null;
    }
    return { neckIn, waistIn, hipIn };
  }, [manualInputs, units]);

  const primaryFile = useMemo(() => {
    const firstCaptured = capturedShots[0];
    if (!firstCaptured) return null;
    return files[firstCaptured] ?? null;
  }, [capturedShots, files]);

  useEffect(() => {
    let cancelled = false;
    if (!primaryFile) {
      setThumbnailDataUrl(null);
      return;
    }
    createThumbnailDataUrl(primaryFile).then((dataUrl) => {
      if (cancelled) return;
      setThumbnailDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [primaryFile]);

  const photoMetadata = useMemo(() => {
    const meta: Partial<Record<ViewName, PhotoMetadata>> = {};
    for (const view of capturedShots) {
      const file = files[view];
      if (!file) continue;
      const key = VIEW_NAME_MAP[view];
      const entry: PhotoMetadata = {
        name: file.name,
        size: file.size,
        type: file.type || "image/jpeg",
      };
      if (typeof file.lastModified === "number") {
        entry.lastModified = file.lastModified;
      }
      meta[key] = entry;
    }
    return meta;
  }, [capturedShots, files]);

  const estimate = useMemo(() => {
    if (!photoFeatures) return null;
    if (!heightIn || !sex) return null;
    return estimateBodyComp({
      sex,
      age,
      heightIn,
      weightLb: weightLb ?? undefined,
      photoFeatures,
      manualCircumferences: manualCircumferences ?? undefined,
    });
  }, [age, heightIn, manualCircumferences, photoFeatures, sex, weightLb]);

  const bodyFatValue = formatDecimal(estimate?.bodyFatPct ?? null);
  const bodyFatPctNumber = Number.isFinite(estimate?.bodyFatPct ?? NaN)
    ? (estimate?.bodyFatPct as number)
    : null;
  const referenceRanges = useMemo<LabeledRange[]>(() => {
    if (!sex || age == null) return [];
    return getSexAgeBands(sex, age);
  }, [age, sex]);
  const ageBandLabel = referenceRanges[0]?.band ?? null;
  const currentReferenceRange =
    bodyFatPctNumber != null ? findRangeForValue(referenceRanges, bodyFatPctNumber) : null;
  const sexLabel = sex ? `${sex.charAt(0).toUpperCase()}${sex.slice(1)}` : null;
  const rangeLabel = currentReferenceRange?.label ?? null;
  const percentText = bodyFatPctNumber != null ? bodyFatPctNumber.toFixed(1) : null;
  const referenceContextText =
    sexLabel && ageBandLabel && percentText && rangeLabel
      ? `For ${sexLabel} age ${ageBandLabel}, ${percentText}% places you in the ${rangeLabel} range.`
      : null;
  const bmiValue = formatDecimal(estimate?.bmi ?? null);
  const weightValue = useMemo(() => {
    const weight = estimate?.usedWeight ?? weightLb ?? null;
    if (!Number.isFinite(weight ?? NaN)) return null;
    return units === "metric"
      ? `${lbToKg(weight as number).toFixed(1)}`
      : `${formatDecimal(weight)}`;
  }, [estimate?.usedWeight, weightLb, units]);

  const photoEstimatePayload = useMemo(
    () => ({
      neck: photoCircumferences?.neckIn ?? null,
      waist: photoCircumferences?.waistIn ?? null,
      hip: photoCircumferences?.hipIn ?? null,
    }),
    [photoCircumferences],
  );

  const userCircumPayload = useMemo(
    () => ({
      neck: manualCircumferences?.neckIn ?? null,
      waist: manualCircumferences?.waistIn ?? null,
      hip: manualCircumferences?.hipIn ?? null,
    }),
    [manualCircumferences],
  );

  const bmiNumber = useMemo(() => {
    const value = estimate?.bmi;
    if (!Number.isFinite(value ?? NaN)) return null;
    return Number((value as number).toFixed(1));
  }, [estimate]);

  const usedWeightLb = useMemo(() => {
    const raw = estimate?.usedWeight ?? weightLb ?? null;
    if (!Number.isFinite(raw ?? NaN)) return null;
    return Number((raw as number).toFixed(1));
  }, [estimate, weightLb]);

  const heightInValue = useMemo(() => {
    if (!Number.isFinite(heightIn ?? NaN)) return null;
    return Number(heightIn);
  }, [heightIn]);

  const payload = useMemo(() => {
    if (bodyFatPctNumber == null) return null;
    const normalizedBf = Number((bodyFatPctNumber as number).toFixed(1));
    return {
      method: "photo" as const,
      bfPct: normalizedBf,
      bmi: bmiNumber,
      weightLb: usedWeightLb,
      sex: sex ?? null,
      age: age ?? null,
      heightIn: heightInValue,
      photoEstimates: photoEstimatePayload,
      userCircumIn: userCircumPayload,
      photos: {
        mode,
        captureViews: capturedShots,
        files: photoMetadata,
      },
      thumbnail: thumbnailDataUrl ?? null,
    };
  }, [
    bodyFatPctNumber,
    bmiNumber,
    usedWeightLb,
    sex,
    age,
    heightInValue,
    photoEstimatePayload,
    userCircumPayload,
    mode,
    capturedShots,
    photoMetadata,
    thumbnailDataUrl,
  ]);

  const payloadSignature = useMemo(() => (payload ? JSON.stringify(payload) : null), [payload]);

  useEffect(() => {
    if (!payload || !payloadSignature) return;
    if (payloadSignature === lastSavedSignature && savedScanId) return;
    const user = auth.currentUser;
    if (!user) return;

    const scansCollection = collection(db, "users", user.uid, "scans");
    const docRef = savedScanId ? doc(scansCollection, savedScanId) : doc(scansCollection);
    const docId = docRef.id;
    let cancelled = false;

    setSaving(true);
    setSaveError(null);

    const data: Record<string, unknown> = {
      ...payload,
      status: "completed",
      updatedAt: serverTimestamp(),
    };
    if (!savedScanId) {
      data.createdAt = serverTimestamp();
    }

    setDoc(docRef, data, { merge: true })
      .then(() => {
        if (cancelled) return;
        setSaving(false);
        setLastSavedSignature(payloadSignature);
        if (!savedScanId) {
          setSavedScanId(docId);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("save_scan_preview", error);
        setSaving(false);
        setSaveError("Unable to save scan. Try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [payload, payloadSignature, savedScanId, lastSavedSignature]);

  const estimateStatus = useMemo(() => {
    if (analysisError) return analysisError;
    if (analyzing) return "Analyzing photos…";
    if (saving) return "Saving scan result…";
    if (saveError) return saveError;
    if (savedScanId) return "Scan saved to your history.";
    if (!allCaptured) return "Capture every required angle to analyze the scan.";
    if (!heightIn || !sex) return "Add your height and sex in Settings to unlock the preview.";
    if (!bodyFatValue) return "Add your weight to see the full estimate.";
    return "Scan preview based on your latest photos.";
  }, [
    analysisError,
    analyzing,
    allCaptured,
    heightIn,
    sex,
    bodyFatValue,
    saving,
    saveError,
    savedScanId,
  ]);

  return (
    <div className="space-y-6">
      <Seo title="Scan Result Preview – MyBodyScan" description="Review the draft estimate before finalizing." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Preview Result</h1>
        <p className="text-muted-foreground">{estimateStatus}</p>
      </div>
      {appCheck.status === "checking" ? (
        <Alert className="border-dashed">
          <AlertTitle>Checking secure access…</AlertTitle>
          <AlertDescription>Ensuring App Check is ready before rendering your scan preview.</AlertDescription>
        </Alert>
      ) : null}
      {!functionsConfigured ? (
        <Alert variant="destructive">
          <AlertTitle>Scan services offline</AlertTitle>
          <AlertDescription>
            We couldn’t find the scan service URL. Add VITE_FUNCTIONS_URL to enable saving results.
          </AlertDescription>
        </Alert>
      ) : null}
      {appCheck.status === "missing" ? (
        <Alert variant="destructive">
          <AlertTitle>App Check required</AlertTitle>
          <AlertDescription>
            Secure access failed. Refresh the page or contact support before finalizing your scan.
          </AlertDescription>
        </Alert>
      ) : null}
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
              Estimated BMI: {bmiValue ?? "—"} · Weight: {weightValue ? `${weightValue} ${units === "metric" ? "kg" : "lb"}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Estimates only. Not a medical diagnosis.</p>
            {referenceContextText ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{referenceContextText}</p>
                <ReferenceChart sex={sex} age={age} bfPct={bodyFatPctNumber} />
              </div>
            ) : null}
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
                <RefineMeasurementsForm
                  onSubmit={() => setRefineOpen(false)}
                  footer={
                    <DialogFooter>
                      <Button type="submit">Close</Button>
                    </DialogFooter>
                  }
                />
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
      {savedScanId ? (
        <Card className="border border-dashed">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Scan saved</p>
              <p className="text-sm text-muted-foreground">Find this scan anytime in your history.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/scan/history">View history</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
