import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { startScanSessionClient, submitScanClient, type ScanUploadProgress } from "@/lib/api/scan";
import { CAPTURE_VIEW_SETS, type CaptureView, resetCaptureFlow, setCaptureSession, useScanCaptureStore } from "./scanCaptureStore";
import { RefineMeasurementsForm } from "./Refine";
import { setPhotoCircumferences, useScanRefineStore } from "./scanRefineStore";
import type { ManualCircumferences } from "./scanRefineStore";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { useUnits } from "@/hooks/useUnits";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { toast } from "@/hooks/use-toast";
import { POSES, type Pose } from "@/features/scan/poses";

const VIEW_NAME_MAP: Record<CaptureView, ViewName> = {
  Front: "front",
  Side: "side",
  Back: "back",
  Left: "left",
  Right: "right",
};

const VIEW_TO_POSE: Partial<Record<CaptureView, Pose>> = {
  Front: "front",
  Back: "back",
  Left: "left",
  Right: "right",
};

type FlowStatus = "idle" | "starting" | "uploading" | "processing" | "error";

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
  const { mode, files, weights, session } = useScanCaptureStore();
  const currentWeightKg = weights.currentWeightKg;
  const goalWeightKg = weights.goalWeightKg;
  const { profile } = useUserProfile();
  const [refineOpen, setRefineOpen] = useState(false);
  const { manualInputs, photoCircumferences } = useScanRefineStore();
  const [photoFeatures, setPhotoFeatures] = useState<PhotoFeatures | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastWeight] = useState<number | null>(() => getLastWeight());
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadPose, setUploadPose] = useState<string | null>(null);
  const [submittedScanId, setSubmittedScanId] = useState<string | null>(null);
  const navigate = useNavigate();
  const appCheck = useAppCheckStatus();
  const { units } = useUnits();
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const scanOffline =
    !scanConfigured ||
    systemHealth?.scanConfigured === false ||
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;
  const scanOfflineMessage = scanOffline
    ? systemHealth?.openaiConfigured === false || systemHealth?.openaiKeyPresent === false
      ? "Scans require the OpenAI key (OPENAI_API_KEY) to be configured before results can be finalized."
      : "Scan services are offline until the Cloud Functions base URL is configured."
    : null;

  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const capturedShots = useMemo(
    () => shots.filter((view) => Boolean(files[view])),
    [shots, files],
  );
  const allCaptured = capturedShots.length === shots.length;
  const poseFiles = useMemo(() => {
    const map: Partial<Record<Pose, File>> = {};
    for (const [view, file] of Object.entries(files) as Array<[CaptureView, File]>) {
      const pose = VIEW_TO_POSE[view];
      if (pose && file) {
        map[pose] = file;
      }
    }
    return map;
  }, [files]);
  const poseUploadsReady = POSES.every((pose) => Boolean(poseFiles[pose]));

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

  const readyForSubmission =
    poseUploadsReady &&
    currentWeightKg != null &&
    goalWeightKg != null &&
    !scanOffline &&
    appCheck.status !== "missing";
  const finalizeHelperMessage = !poseUploadsReady
    ? "Capture all four required angles before continuing."
    : currentWeightKg == null || goalWeightKg == null
      ? "Return to Start to confirm your current and goal weight."
      : scanOffline
        ? "Scan services are offline until the backend is configured."
        : appCheck.status === "missing"
          ? "Secure uploads require App Check. Refresh and try again."
          : "We'll upload your photos securely and notify you when the result is ready.";
  const finalizeDisabled =
    !readyForSubmission || flowStatus === "starting" || flowStatus === "uploading" || flowStatus === "processing";

  const handleFinalize = async () => {
    if (!poseUploadsReady || currentWeightKg == null || goalWeightKg == null) {
      setFlowError("Add all photos and confirm your weights before continuing.");
      return;
    }
    if (scanOffline) {
      setFlowError("Scan services are offline. Try again later.");
      return;
    }
    if (appCheck.status === "missing") {
      setFlowError("Secure uploads require App Check. Refresh this page and try again.");
      return;
    }
    setFlowStatus("starting");
    setFlowError(null);
    setUploadProgress(0);
    setUploadPose(null);
    try {
      let activeSession = session;
      if (!activeSession) {
        const start = await startScanSessionClient({ currentWeightKg, goalWeightKg });
        if (!start.ok) {
          const debugSuffix = start.error.debugId ? ` (ref ${start.error.debugId.slice(0, 8)})` : "";
          throw new Error(start.error.message + debugSuffix);
        }
        setCaptureSession(start.data);
        activeSession = start.data;
      }
      if (!activeSession) {
        throw new Error("Unable to start scan session.");
      }
      const photos = {
        front: poseFiles.front!,
        back: poseFiles.back!,
        left: poseFiles.left!,
        right: poseFiles.right!,
      };
      setFlowStatus("uploading");
      const submit = await submitScanClient(
        {
          scanId: activeSession.scanId,
          storagePaths: activeSession.storagePaths,
          photos,
          currentWeightKg,
          goalWeightKg,
        },
        {
          onUploadProgress: (info: ScanUploadProgress) => {
            setUploadProgress(info.overallPercent);
            setUploadPose(info.pose);
          },
        },
      );
      if (!submit.ok) {
        const debugSuffix = submit.error.debugId ? ` (ref ${submit.error.debugId.slice(0, 8)})` : "";
        throw new Error(submit.error.message + debugSuffix);
      }
      setFlowStatus("processing");
      setUploadPose(null);
      setSubmittedScanId(activeSession.scanId);
      toast({
        title: "Scan uploaded",
        description: "We’re processing your analysis. This can take a couple of minutes.",
      });
      resetCaptureFlow();
      navigate(`/scan/${activeSession.scanId}`);
    } catch (error: any) {
      setFlowStatus("error");
      const message =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : "Unable to submit your scan. Please try again.";
      setFlowError(message);
    }
  };


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

  const estimateStatus = useMemo(() => {
    if (analysisError) return analysisError;
    if (analyzing) return "Analyzing photos…";
    if (flowStatus === "starting") return "Preparing secure upload…";
    if (flowStatus === "uploading") {
      const progressPct = Math.round(uploadProgress * 100);
      return uploadPose
        ? `Uploading ${uploadPose} photo (${progressPct}% complete)…`
        : "Uploading encrypted photos…";
    }
    if (flowStatus === "processing") return "Photos uploaded. Processing your scan…";
    if (flowError) return flowError;
    if (submittedScanId) return "Scan uploaded. Opening your result…";
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
    flowStatus,
    flowError,
    uploadProgress,
    uploadPose,
    submittedScanId,
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
      {scanOfflineMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Scan services offline</AlertTitle>
          <AlertDescription>{scanOfflineMessage}</AlertDescription>
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
      <Card className="border border-dashed bg-muted/40">
        <CardHeader>
          <CardTitle>Finalize scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{finalizeHelperMessage}</p>
          {flowError ? <p className="text-sm text-destructive">{flowError}</p> : null}
          {flowStatus === "uploading" ? (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.round(uploadProgress * 100))}%` }}
                />
              </div>
              {uploadPose ? (
                <p className="text-xs text-muted-foreground">
                  Uploading {uploadPose} ({Math.round(uploadProgress * 100)}%)
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleFinalize} disabled={finalizeDisabled}>
              {flowStatus === "uploading"
                ? "Uploading…"
                : flowStatus === "processing"
                  ? "Processing…"
                  : flowStatus === "starting"
                    ? "Preparing…"
                    : "Finalize with AI"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/scan/capture")}>
              Retake photos
            </Button>
          </div>
        </CardContent>
      </Card>
      {submittedScanId ? (
        <Card className="border border-dashed">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Scan submitted</p>
              <p className="text-sm text-muted-foreground">
                We’re processing the analysis now. You can review it in your history at any time.
              </p>
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
