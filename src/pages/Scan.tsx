import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { DemoBanner } from "@/components/DemoBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCredits } from "@/hooks/useCredits";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { demoNoAuth } from "@/lib/demoFlag";
import { DEMO_LATEST_RESULT } from "@/lib/demoSamples";
import { cmToIn, kgToLb } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { Unsubscribe } from "firebase/firestore";
import { listenToScan, PoseKey, ScanResultResponse, type ScanStatus, startLiveScan, submitLiveScan, uploadScanImages } from "@/lib/liveScan";
// App Check removed; treat as immediately ready
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { useBackNavigationGuard } from "@/lib/back";
import { MIN_IMAGE_DIMENSION, isAllowedImageType, readImageDimensions } from "@/lib/imageValidation";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const IDEMPOTENCY_STORAGE_KEY = "scan:idempotency";

const POSES: Array<{ key: PoseKey; label: string; helper: string }> = [
  { key: "front", label: "Front", helper: "Face forward, arms relaxed" },
  { key: "back", label: "Back", helper: "Back to camera, feet shoulder-width" },
  { key: "left", label: "Left", helper: "Left profile, arms slightly out" },
  { key: "right", label: "Right", helper: "Right profile, arms slightly out" },
];

type FileMap = Record<PoseKey, File | null>;
type PreviewMap = Record<PoseKey, string>;

type Stage = "idle" | "starting" | "uploading" | "analyzing" | "complete";

function emptyFileMap(): FileMap {
  return { front: null, back: null, left: null, right: null };
}

function emptyPreviewMap(): PreviewMap {
  return { front: "", back: "", left: "", right: "" };
}

function readStoredIdempotencyKey(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
  return stored && stored.trim().length ? stored : null;
}

function persistIdempotencyKey(key: string | null) {
  if (typeof window === "undefined") return;
  if (key) {
    window.localStorage.setItem(IDEMPOTENCY_STORAGE_KEY, key);
  } else {
    window.localStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
  }
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Scan() {
  const [files, setFiles] = useState<FileMap>(emptyFileMap);
  const [previews, setPreviews] = useState<PreviewMap>(emptyPreviewMap);
  const [stage, setStage] = useState<Stage>("idle");
  const [progressText, setProgressText] = useState<string>("");
  const [uploadIndex, setUploadIndex] = useState<number>(0);
  const [result, setResult] = useState<ScanResultResponse | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [showProcessingTip, setShowProcessingTip] = useState(false);
  const statusUnsub = useRef<Unsubscribe | null>(null);
  const stageRef = useRef<Stage>("idle");
  const completeToastShown = useRef(false);
  const failureToastShown = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(() => readStoredIdempotencyKey());
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const demo = useDemoMode();
  const appCheckReady = true;
  const { credits, loading: creditsLoading } = useCredits();
  const guardMessage = "Going back may cancel the current action. Continue?";
  const shouldBlockBackNavigation = useCallback(
    () => submitting || stage === "starting" || stage === "uploading" || stage === "analyzing",
    [stage, submitting],
  );
  useBackNavigationGuard(shouldBlockBackNavigation, { message: guardMessage });

  useEffect(() => {
    const next: PreviewMap = emptyPreviewMap();
    const urls: string[] = [];
    POSES.forEach(({ key }) => {
      const file = files[key];
      if (file) {
        const url = URL.createObjectURL(file);
        next[key] = url;
        urls.push(url);
      }
    });
    setPreviews(next);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    if (profile?.weight_kg != null && !weight) {
      setWeight(kgToLb(profile.weight_kg).toFixed(1));
    }
    if (profile?.height_cm != null && !height) {
      setHeight(cmToIn(profile.height_cm).toFixed(1));
    }
    if (profile?.age != null && !age) {
      setAge(String(profile.age));
    }
    if (profile?.sex && !sex) {
      setSex(profile.sex);
    }
  }, [profile?.weight_kg, profile?.height_cm, profile?.age, profile?.sex, weight, height, age, sex]);

  const allPhotosSelected = useMemo(() => POSES.every(({ key }) => Boolean(files[key])), [files]);

  useEffect(() => {
    persistIdempotencyKey(idempotencyKey);
  }, [idempotencyKey]);

  useEffect(() => {
    return () => {
      if (statusUnsub.current) {
        statusUnsub.current();
        statusUnsub.current = null;
      }
    };
  }, []);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const clearIdempotency = useCallback(() => {
    setIdempotencyKey(null);
  }, []);

  const attachStatusListener = useCallback(
    (id: string) => {
      if (statusUnsub.current) {
        statusUnsub.current();
        statusUnsub.current = null;
      }
      setScanId(id);
      setScanStatus(null);
      completeToastShown.current = false;
      failureToastShown.current = false;
      statusUnsub.current = listenToScan(
        id,
        (snapshot) => {
          setScanStatus(snapshot);
          if (!snapshot) return;
          const normalizedStatus = snapshot.status?.toLowerCase?.() ?? "";

          if (normalizedStatus === "complete" || normalizedStatus === "completed") {
            if (snapshot.result) {
              const normalized: ScanResultResponse = {
                id: snapshot.id,
                createdAt: snapshot.createdAt,
                completedAt: snapshot.completedAt ?? snapshot.createdAt,
                engine: snapshot.engine ?? "openai",
                status: snapshot.status,
                inputs: snapshot.inputs,
                result: snapshot.result,
                metadata: snapshot.metadata,
                creditsRemaining: snapshot.creditsRemaining,
                provider: snapshot.provider ?? "openai",
              };
              if (statusUnsub.current) {
                statusUnsub.current();
                statusUnsub.current = null;
              }
              setResult(normalized);
              setStage("complete");
              setProgressText("Estimate ready");
              if (!completeToastShown.current) {
                toast({ title: "Estimate ready", description: "Your result has been saved to History." });
                completeToastShown.current = true;
              }
              clearIdempotency();
            }
          } else if (normalizedStatus === "failed" || normalizedStatus === "aborted") {
            const description = snapshot.error || "Scan failed. Please try again.";
            if (!failureToastShown.current) {
              toast({ title: "Scan failed", description, variant: "destructive" });
              failureToastShown.current = true;
            }
            if (statusUnsub.current) {
              statusUnsub.current();
              statusUnsub.current = null;
            }
            setScanId(null);
            setStage("idle");
            setProgressText(description);
            setResult(null);
            clearIdempotency();
          } else {
            if (stageRef.current !== "uploading" && stageRef.current !== "starting") {
              setProgressText("Analyzing photos with OpenAI Vision…");
            }
            setStage((prev) => (prev === "uploading" || prev === "starting" ? prev : "analyzing"));
          }
        },
        (error) => {
          console.error("scan_status_error", error);
        },
      );
    },
    [clearIdempotency, toast],
  );

  const handleFileChange = useCallback(
    (pose: PoseKey, event: ChangeEvent<HTMLInputElement>) => {
      const inputEl = event.target;
      const file = inputEl.files?.[0] ?? null;
      inputEl.value = "";
      if (!file) {
        setFiles((prev) => ({ ...prev, [pose]: null }));
        return;
      }

      if (!isAllowedImageType(file)) {
        toast({ title: "Unsupported photo", description: "Use JPEG or PNG photos.", variant: "destructive" });
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        toast({ title: "Photo too large", description: "Each photo must be under 15 MB.", variant: "destructive" });
        return;
      }

      void (async () => {
        try {
          const { width, height } = await readImageDimensions(file);
          if (Math.min(width, height) < MIN_IMAGE_DIMENSION) {
            toast({
              title: "Photo too small",
              description: `Photos must be at least ${MIN_IMAGE_DIMENSION}px on the shortest side.`,
              variant: "destructive",
            });
            return;
          }
          setFiles((prev) => ({ ...prev, [pose]: file }));
        } catch {
          toast({
            title: "Photo unreadable",
            description: "Select a different photo and try again.",
            variant: "destructive",
          });
        }
      })();
    },
    [toast],
  );

  const clearPhoto = (pose: PoseKey) => {
    setFiles((prev) => ({ ...prev, [pose]: null }));
  };

  const abortActiveUpload = useCallback(() => {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
  }, []);

  useEffect(() => () => abortActiveUpload(), [abortActiveUpload]);

  const resetState = useCallback(() => {
    abortActiveUpload();
    setStage("idle");
    setProgressText("");
    setUploadIndex(0);
  }, [abortActiveUpload]);

  const handleAnalyze = async () => {
    if (submitting) return;
    if (demo && demoNoAuth) {
      if (!allPhotosSelected) {
        toast({ title: "Add all photos", description: "Front, back, left, and right photos are required." });
        return;
      }
      setSubmitting(true);
      setStage("analyzing");
      setProgressText("Processing demo scan…");
      setTimeout(() => {
        setSubmitting(false);
        setStage("complete");
        setProgressText("Estimate ready");
        toast({ title: "Demo estimate ready", description: "Showing a sample result." });
        navigate(`/results/${DEMO_LATEST_RESULT.id}`);
      }, 1200);
      return;
    }
    if (demo && !demoNoAuth) {
      demoToast();
      return;
    }
    if (!allPhotosSelected) {
      toast({ title: "Add all photos", description: "Front, back, left, and right photos are required." });
      return;
    }
    if (!appCheckReady) {
      toast({ title: "Almost ready", description: "Secure scanning is initializing. Try again in a moment." });
      return;
    }

    let key = idempotencyKey;
    if (!key) {
      key = generateIdempotencyKey();
      setIdempotencyKey(key);
    }

    const fileMap: Record<PoseKey, File> = {
      front: files.front!,
      back: files.back!,
      left: files.left!,
      right: files.right!,
    };

    const payload: SubmitPayload = { scanId: "", idempotencyKey: key };

    const weightValue = parseFloat(weight);
    if (Number.isFinite(weightValue) && weightValue > 0) {
      payload.weightLb = Number(weightValue.toFixed(1));
    }
    const heightValue = parseFloat(height);
    if (Number.isFinite(heightValue) && heightValue > 0) {
      payload.heightIn = Number(heightValue.toFixed(1));
    }
    const ageValue = parseInt(age, 10);
    if (Number.isFinite(ageValue) && ageValue > 0) {
      payload.age = ageValue;
    }
    if (sex) {
      payload.sex = sex;
    }

    setSubmitting(true);
    setStage("starting");
    setProgressText("Creating secure upload session...");
    setUploadIndex(0);
    setResult(null);

    let uploadController: AbortController | null = null;
    try {
      const session = await startLiveScan();
      payload.scanId = session.scanId;
      attachStatusListener(session.scanId);
      setStage("uploading");
      uploadController = new AbortController();
      uploadAbortRef.current = uploadController;
      await uploadScanImages(session.uploadUrls, fileMap, {
        signal: uploadController.signal,
        onProgress: ({ pose, index, total }) => {
          setUploadIndex(index + 1);
          const label = POSES.find((item) => item.key === pose)?.label || pose;
          setProgressText(`Uploading ${label} (${index + 1}/${total})`);
        },
      });
      uploadAbortRef.current = null;
      uploadController = null;
      setStage("analyzing");
      setProgressText("Analyzing photos with OpenAI Vision...");
      await submitLiveScan(payload);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        resetState();
        toast({ title: "Upload canceled", description: "You can try again when ready." });
        setScanId(null);
        setScanStatus(null);
        return;
      }
      console.error("scan_analyze_error", err);
      let description = err?.message || "Unable to process scan right now.";
      if (err?.code === "app_check_unavailable") {
        description = "Secure token missing. Refresh the page and try again.";
      } else if (err?.status === 402 || err?.message === "no_credits") {
        description = "Add credits to run another scan.";
        toast({ title: "No scan credits", description, variant: "destructive" });
        clearIdempotency();
        resetState();
        setSubmitting(false);
        navigate("/plans");
        return;
      } else if (err?.status === 503 || err?.message === "scan_engine_unavailable") {
        description = "Vision model is temporarily unavailable. Please try again later.";
      } else if (err?.status === 400) {
        description = "Upload failed. Ensure all four photos were added and try again.";
      } else if (err?.status === 401) {
        description = "Sign in again to continue.";
        clearIdempotency();
        navigate("/auth");
      }
      toast({ title: "Scan failed", description, variant: "destructive" });
      setScanId(null);
      setScanStatus(null);
      resetState();
    } finally {
      if (uploadController) {
        uploadController.abort();
      }
      if (uploadAbortRef.current === uploadController) {
        uploadAbortRef.current = null;
      }
      setSubmitting(false);
    }
  };

  const disableAnalyze = !allPhotosSelected || submitting || demo;
  const selectSexValue = sex === "" ? undefined : sex;

  const initializing = false;
  const creditsDisplay = creditsLoading ? "…" : credits === Infinity ? "∞" : credits;

  useEffect(() => {
    if (stage === "analyzing") {
      const timer = window.setTimeout(() => setShowProcessingTip(true), 60_000);
      return () => {
        window.clearTimeout(timer);
      };
    }
    setShowProcessingTip(false);
    return () => undefined;
  }, [stage]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0" data-testid="route-scan">
      <Seo title="Live Scan – MyBodyScan" description="Capture four angles to estimate your body-fat percentage." />
      <NotMedicalAdviceBanner />
      <ErrorBoundary title="Scan failed to load" description="Retry to resume your scanning session.">
        <main className="max-w-md mx-auto p-6 space-y-6">
          <DemoBanner />
          <div className="text-center space-y-2">
            <Camera className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">Live Body Scan</h1>
            <p className="text-sm text-muted-foreground">Upload four clear photos for a visual estimate of body-fat percentage.</p>
          </div>

          {initializing && (
            <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4 text-sm text-primary">
              Secure scanning is initializing. You can stage your photos now and analyze once ready.
            </div>
          )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Upload Required Angles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Photos are processed for this estimate and then deleted. We store only your result.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {POSES.map(({ key, label, helper }) => {
                    const file = files[key];
                    const preview = previews[key];
                    const inputId = `pose-${key}`;
                    return (
                      <div key={key} className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">{label}</Label>
                        <label
                          htmlFor={inputId}
                          className={cn(
                            "relative flex h-32 w-full items-center justify-center rounded-lg border border-dashed transition",
                            file ? "border-primary/60" : "border-muted-foreground/40 hover:border-primary/60",
                            "overflow-hidden"
                          )}
                        >
                          {preview ? (
                            <img src={preview} alt={`${label} preview`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
                              <ImageIcon className="h-6 w-6" />
                              <span className="text-xs font-medium">Tap to add {label}</span>
                              <span className="text-[10px] leading-tight">{helper}</span>
                            </div>
                          )}
                        </label>
                        <input
                          id={inputId}
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          capture="environment"
                          className="hidden"
                          onChange={(event) => handleFileChange(key, event)}
                        />
                        {file ? (
                          <Button variant="ghost" size="sm" className="w-full" onClick={() => clearPhoto(key)}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Replace photo
                          </Button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Images only · Under 15 MB · ≥ 640px</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Optional details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="weight">Weight (lb)</Label>
                  <Input
                    id="weight"
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g. 170"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="height">Height (in)</Label>
                  <Input
                    id="height"
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g. 70"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 32"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sex</Label>
                  <Select value={selectSexValue} onValueChange={(value) => setSex(value as "male" | "female")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

          {submitting && (
            <Card>
            <CardContent className="flex items-start gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div role="status" aria-live="polite">
                <p className="text-sm font-medium text-foreground">{progressText || "Processing..."}</p>
                {stage === "uploading" && (
                  <p className="text-xs text-muted-foreground">Uploaded {Math.min(uploadIndex, POSES.length)} / {POSES.length}</p>
                )}
                {showProcessingTip && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This can take a bit. You can navigate; we’ll update automatically.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {result && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Estimate • OpenAI Vision</span>
                  <Badge variant="outline" className="uppercase text-[10px] tracking-wide">{result.result.confidence} confidence</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-4xl font-semibold text-foreground">{result.result.bfPercent.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Range {result.result.low.toFixed(1)}% – {result.result.high.toFixed(1)}%</p>
                </div>
                <p className="text-sm text-muted-foreground">{result.result.notes}</p>
                {result.provider === "mock" && (
                  <p className="text-xs text-muted-foreground">Vision unavailable; using mock.</p>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>This estimate is saved to your History automatically.</p>
                  {typeof result.creditsRemaining === "number" && (
                    <p>Credits remaining: {result.creditsRemaining}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate("/history")}>View history</Button>
                  <Button variant="ghost" onClick={() => navigate("/plans")}>Add credits</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <Button
              className="w-full h-12 text-base"
              disabled={disableAnalyze}
              onClick={handleAnalyze}
              title={demo ? "Demo mode: sign in to save" : undefined}
              data-testid="scan-submit"
            >
              {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {demo ? "Demo only" : submitting ? "Analyzing…" : "Analyze"}
            </Button>
            <div className="text-xs text-center text-muted-foreground">
              Credits: {creditsDisplay}
            </div>
            {initializing && (
              <p className="text-xs text-center text-muted-foreground">Secure services are starting up—tap Analyze once this message disappears.</p>
            )}
            <p className="text-xs text-center text-muted-foreground">1 credit will be used once analysis completes. Results are estimates only.</p>
          </div>
        </main>
        <BottomNav />
      </ErrorBoundary>
    </div>
  );
}

type SubmitPayload = {
  scanId: string;
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex?: "male" | "female";
  idempotencyKey?: string;
};
