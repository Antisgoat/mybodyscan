import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
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
import { cmToIn, kgToLb } from "@/lib/units";
import { cn } from "@/lib/utils";
import { PoseKey, ScanResultResponse, startLiveScan, submitLiveScan, uploadScanImages, pollScanStatus, ScanStatusResponse } from "@/lib/liveScan";
import { useAppCheckReady } from "@/components/AppCheckProvider";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IDEMPOTENCY_STORAGE_KEY = "scan:idempotency";

const POSES: Array<{ key: PoseKey; label: string; helper: string }> = [
  { key: "front", label: "Front", helper: "Face forward, arms relaxed" },
  { key: "back", label: "Back", helper: "Back to camera, feet shoulder-width" },
  { key: "left", label: "Left", helper: "Left profile, arms slightly out" },
  { key: "right", label: "Right", helper: "Right profile, arms slightly out" },
];

type FileMap = Record<PoseKey, File | null>;
type PreviewMap = Record<PoseKey, string>;

type Stage = "idle" | "starting" | "uploading" | "analyzing" | "processing" | "complete" | "failed";

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
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(() => readStoredIdempotencyKey());
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const demo = useDemoMode();
  const appCheckReady = useAppCheckReady();
  const { credits, loading: creditsLoading } = useCredits();

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

  const clearIdempotency = () => {
    setIdempotencyKey(null);
  };

  const handleFileChange = (pose: PoseKey, fileList: FileList | null) => {
    const file = fileList?.[0] || null;
    if (!file) {
      setFiles((prev) => ({ ...prev, [pose]: null }));
      return;
    }
    const typeValid = file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg");
    if (!typeValid) {
      toast({ title: "Unsupported file", description: "Please upload a .jpg or .jpeg photo.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "Photo too large", description: "Each photo must be under 10 MB.", variant: "destructive" });
      return;
    }
    setFiles((prev) => ({ ...prev, [pose]: file }));
  };

  const clearPhoto = (pose: PoseKey) => {
    setFiles((prev) => ({ ...prev, [pose]: null }));
  };

  const resetState = () => {
    setStage("idle");
    setProgressText("");
    setUploadIndex(0);
    setCurrentScanId(null);
  };

  const handleAnalyze = async () => {
    if (submitting) return;
    if (demo) {
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

    try {
      const session = await startLiveScan();
      payload.scanId = session.scanId;
      setCurrentScanId(session.scanId);
      setStage("uploading");
      await uploadScanImages(session.uploadUrls, fileMap, ({ pose, index, total }) => {
        setUploadIndex(index + 1);
        const label = POSES.find((item) => item.key === pose)?.label || pose;
        setProgressText(`Uploading ${label} (${index + 1}/${total})`);
      });
      setStage("analyzing");
      setProgressText("Analyzing photos with OpenAI Vision...");
      
      // Submit scan and start polling for status
      await submitLiveScan(payload);
      setStage("processing");
      setProgressText("Processing your scan...");
      
      const response = await pollScanStatus(
        session.scanId,
        (status: ScanStatusResponse) => {
          if (status.status === "processing") {
            setProgressText("Processing your scan...");
          } else if (status.status === "failed") {
            setStage("failed");
            setProgressText("Scan processing failed");
          }
        }
      );
      
      setStage("complete");
      setProgressText("Estimate ready");
      setResult(response);
      clearIdempotency();
      toast({ title: "Estimate ready", description: "Your result has been saved to History." });
    } catch (err: any) {
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
      resetState();
    } finally {
      setSubmitting(false);
    }
  };

  const disableAnalyze = !allPhotosSelected || submitting || demo;
  const selectSexValue = sex === "" ? undefined : sex;

  const initializing = !appCheckReady;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0" data-testid="route-scan">
      <Seo title="Live Scan – MyBodyScan" description="Capture four angles to estimate your body-fat percentage." />
      <AppHeader />
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
                          accept="image/jpeg,.jpg,.jpeg"
                          className="hidden"
                          onChange={(event) => handleFileChange(key, event.target.files)}
                        />
                        {file ? (
                          <Button variant="ghost" size="sm" className="w-full" onClick={() => clearPhoto(key)}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Replace photo
                          </Button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">JPG only · Under 10 MB</p>
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
              <div>
                <p className="text-sm font-medium text-foreground">{progressText || "Processing..."}</p>
                {stage === "uploading" && (
                  <p className="text-xs text-muted-foreground">Uploaded {Math.min(uploadIndex, POSES.length)} / {POSES.length}</p>
                )}
                {stage === "processing" && (
                  <p className="text-xs text-muted-foreground">This may take up to 2 minutes...</p>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {stage === "failed" && (
            <Card className="border-destructive/40">
              <CardContent className="flex items-start gap-3 py-4">
                <div className="h-5 w-5 rounded-full bg-destructive/20 flex items-center justify-center">
                  <span className="text-destructive text-xs">!</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-destructive">Scan processing failed</p>
                  <p className="text-xs text-muted-foreground">Please try again or contact support if the issue persists.</p>
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
              Credits: {creditsLoading ? "…" : credits}
            </div>
            {!creditsLoading && credits === 0 && (
              <div className="text-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate("/plans")}
                  className="text-xs"
                >
                  Buy more credits
                </Button>
              </div>
            )}
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
