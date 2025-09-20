import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Seo } from "@/components/Seo";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { auth, db } from "@/lib/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { beginPaidScan, recordGateFailure, refundIfNoResult, startScan } from "@/lib/api";
import { computeImageHash, runClientGate, type GateImage, type GateResult } from "@/lib/scan/gates";
import { estimateCircumferences } from "@/lib/scan/photoAssist";
import { computeBodyFat, bmiFromKgCm } from "@/lib/scan/anthro";
import { formatBmi, formatWeightFromKg, formatHeightFromCm, CM_PER_IN } from "@/lib/units";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { value: "2" | "4"; label: string; description: string }[] = [
  { value: "2", label: "Quick (2 photos)", description: "Front + Side" },
  { value: "4", label: "Precise (4 photos)", description: "Front, Back, Left, Right" },
];

type PhotoKey = "front" | "side" | "back" | "left" | "right";

type Stage = "idle" | "gating" | "authorizing" | "analyzing" | "saving";

interface ManualInputState {
  neck: string;
  waist: string;
  hip: string;
}

function requiredPhotos(mode: "2" | "4"): { key: PhotoKey; label: string; helper: string }[] {
  if (mode === "2") {
    return [
      { key: "front", label: "Front", helper: "Full body, arms out" },
      { key: "side", label: "Side", helper: "Profile view" },
    ];
  }
  return [
    { key: "front", label: "Front", helper: "Face camera" },
    { key: "back", label: "Back", helper: "Back to camera" },
    { key: "left", label: "Left", helper: "Left profile" },
    { key: "right", label: "Right", helper: "Right profile" },
  ];
}

function average(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (!valid.length) return undefined;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

function convertManualToCm(inputs: ManualInputState): { neck_cm?: number; waist_cm?: number; hip_cm?: number } {
  const neck = inputs.neck ? parseFloat(inputs.neck) * CM_PER_IN : undefined;
  const waist = inputs.waist ? parseFloat(inputs.waist) * CM_PER_IN : undefined;
  const hip = inputs.hip ? parseFloat(inputs.hip) * CM_PER_IN : undefined;
  return {
    neck_cm: Number.isFinite(neck) ? neck : undefined,
    waist_cm: Number.isFinite(waist) ? waist : undefined,
    hip_cm: Number.isFinite(hip) ? hip : undefined,
  };
}

export default function ScanNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const [mode, setMode] = useState<"2" | "4">("2");
  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>({
    front: null,
    side: null,
    back: null,
    left: null,
    right: null,
  });
  const [manual, setManual] = useState<ManualInputState>({ neck: "", waist: "", hip: "" });
  const [gateResult, setGateResult] = useState<GateResult | null>(null);
  const [gateFailures, setGateFailures] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [qcMessages, setQcMessages] = useState<string[]>([]);

  const required = useMemo(() => requiredPhotos(mode), [mode]);
  const selectedFiles = useMemo(() => {
    if (mode === "2") {
      return [photos.front, photos.side].filter((file): file is File => !!file);
    }
    return [photos.front, photos.back, photos.left, photos.right].filter((file): file is File => !!file);
  }, [mode, photos]);

  const canSubmit = required.every(({ key }) => photos[key]);
  const heightCm = profile?.height_cm;
  const weightKg = profile?.weight_kg;
  const sex = profile?.sex;

  const weightDisplay = weightKg ? formatWeightFromKg(weightKg) : "—";
  const bmiDisplay = weightKg && heightCm ? formatBmi(bmiFromKgCm(weightKg, heightCm)) : "—";

  const handleFileChange = (key: PhotoKey, file: File | null) => {
    setPhotos((prev) => ({ ...prev, [key]: file }));
  };

  const resetAnalysisState = () => {
    setGateResult(null);
    setQcMessages([]);
  };

  const handleAnalyze = async () => {
    if (!auth.currentUser) {
      toast({ title: "Sign in required", description: "Please sign in to run a scan.", variant: "destructive" });
      navigate("/auth");
      return;
    }
    if (!canSubmit) {
      toast({ title: "Missing photos", description: "Add all required angles before analyzing." });
      return;
    }
    if (!heightCm) {
      toast({
        title: "Add your height",
        description: "Height is required for body-fat estimates. Update your profile first.",
        variant: "destructive",
      });
      navigate("/settings");
      return;
    }

    const imageList: GateImage[] = mode === "2"
      ? [photos.front!, photos.side!]
      : [photos.front!, photos.back!, photos.left!, photos.right!];

    resetAnalysisState();
    setStage("gating");
    try {
      const gate = await runClientGate(imageList, { mode });
      setGateResult(gate);
      if (!gate.pass) {
        setGateFailures((count) => count + 1);
        try {
          await recordGateFailure();
        } catch (error) {
          console.error("recordGateFailure", error);
        }
        toast({
          title: "Check photo quality",
          description: gate.reasons[0] || "Retake photos and try again.",
          variant: "destructive",
        });
        setStage("idle");
        return;
      }

      const primaryFile = photos.front ?? photos.side ?? selectedFiles[0];
      if (!primaryFile) {
        throw new Error("no_primary_photo");
      }

      setStage("authorizing");
      const { scanId } = await startScan({
        filename: primaryFile.name,
        size: primaryFile.size,
        contentType: primaryFile.type || "image/jpeg",
      });

      const hashes = await Promise.all(imageList.map((file) => computeImageHash(file)));
      await beginPaidScan({ scanId, hashes, gateScore: gate.score, mode });

      setStage("analyzing");
      const assist = await estimateCircumferences({
        mode,
        front: photos.front!,
        side: mode === "2" ? photos.side! : photos.left ?? photos.side ?? photos.right!,
        back: mode === "4" ? photos.back ?? undefined : undefined,
        left: mode === "4" ? photos.left ?? undefined : undefined,
        right: mode === "4" ? photos.right ?? undefined : undefined,
        height_cm: heightCm,
        sex,
      });

      const qcAccumulator = [...assist.qc];

      let confidence = assist.confidence;
      let circumferences = {
        neck_cm: assist.neck_cm,
        waist_cm: assist.waist_cm,
        hip_cm: assist.hip_cm,
      };
      let method: "photo" | "photo+measure" | "bmi_fallback" = "photo";

      const manualCm = convertManualToCm(manual);
      const hasManual = Object.values(manualCm).some((value) => Number.isFinite(value));
      if (confidence < 0.7 && hasManual) {
        circumferences = {
          neck_cm: average([assist.neck_cm, manualCm.neck_cm]),
          waist_cm: average([assist.waist_cm, manualCm.waist_cm]),
          hip_cm: average([assist.hip_cm, manualCm.hip_cm]),
        };
        confidence = Math.max(confidence, 0.75);
        method = "photo+measure";
        qcAccumulator.push("manual_measurements_applied");
      }

      const bodyFat = computeBodyFat({
        sex,
        height_cm: heightCm,
        neck_cm: circumferences.neck_cm,
        waist_cm: circumferences.waist_cm,
        hip_cm: circumferences.hip_cm,
        weight_kg: weightKg,
      });
      let bfPercent = bodyFat.bfPercent ?? null;
      confidence = Math.min(confidence, bodyFat.confidence || confidence);

      let bmi = weightKg && heightCm ? bmiFromKgCm(weightKg, heightCm) : undefined;

      if (confidence < 0.7) {
        if (weightKg && window.confirm("Photo confidence is low. Use BMI-only fallback instead?")) {
          const fallback = computeBodyFat({ sex, height_cm: heightCm, weight_kg: weightKg });
          bfPercent = fallback.bfPercent ?? bfPercent;
          confidence = Math.min(0.55, fallback.confidence || 0.5);
          method = "bmi_fallback";
          qcAccumulator.push("bmi_fallback_used");
        } else {
          await refundIfNoResult(scanId);
          toast({
            title: "Retake required",
            description: "We couldn't get a confident reading. Try improving lighting and distance.",
            variant: "destructive",
          });
          setStage("idle");
          return;
        }
      }

      if (bfPercent == null) {
        await refundIfNoResult(scanId);
        toast({
          title: "Unable to calculate",
          description: "We couldn't produce a valid body-fat estimate.",
          variant: "destructive",
        });
        setStage("idle");
        return;
      }

      setStage("saving");
      setQcMessages(qcAccumulator);
      const uid = auth.currentUser.uid;
      const scanRef = doc(db, "users", uid, "scans", scanId);
      await setDoc(
        scanRef,
        {
          status: "completed",
          charged: true,
          method,
          confidence,
          mode,
          gateScore: gate.score,
          imageHashes: hashes,
          qc: qcAccumulator,
          analysis: {
            neck_cm: circumferences.neck_cm ?? null,
            waist_cm: circumferences.waist_cm ?? null,
            hip_cm: circumferences.hip_cm ?? null,
          },
          result: {
            bf_percent: bfPercent,
            bmi: bmi ?? null,
          },
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast({ title: "Scan complete", description: "Results saved" });
      navigate(`/results/${scanId}`);
    } catch (error: any) {
      console.error("scan_analyze_error", error);
      const message = error?.message ?? "Analysis failed";
      toast({ title: "Unable to complete scan", description: message, variant: "destructive" });
      setStage("idle");
    }
  };

  const busy = stage !== "idle";

  return (
    <div className="min-h-screen bg-background">
      <Seo title="Photo Scan – MyBodyScan" description="Analyze body composition from full-body photos" />
      <NotMedicalAdviceBanner />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">New Photo Scan</h1>
          <p className="text-muted-foreground">
            Upload clear, full-body photos in US units. Credits are charged only after quality checks pass.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Choose Mode</CardTitle>
            <CardDescription>Both modes use 1 credit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  mode === option.value ? "border-primary bg-primary/5" : "hover:bg-muted"
                )}
                disabled={busy}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{option.label}</span>
                  {mode === option.value && <Badge>Selected</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload Photos</CardTitle>
            <CardDescription>Neutral background, bright lighting, arms away from torso.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {required.map(({ key, label, helper }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleFileChange(key, event.target.files?.[0] ?? null)}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">{helper}</p>
                {photos[key] && (
                  <img
                    src={URL.createObjectURL(photos[key]!)}
                    alt={`${label} preview`}
                    className="h-32 w-full rounded-md object-cover"
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Optional Tape Measurements</CardTitle>
            <CardDescription>Use inches. We blend these if photo confidence is low.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {["neck", "waist", "hip"].map((key) => (
              <div key={key} className="space-y-1">
                <Label className="capitalize">{key} (in)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={(manual as any)[key]}
                  onChange={(event) => setManual((prev) => ({ ...prev, [key]: event.target.value }))}
                  placeholder="Optional"
                  disabled={busy}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {gateResult && (
          <Card>
            <CardHeader>
              <CardTitle>Quality Check</CardTitle>
              <CardDescription>
                {gateResult.pass ? "Passed" : "Needs attention"} • Score {(gateResult.score * 100).toFixed(0)}%
              </CardDescription>
            </CardHeader>
            <CardContent>
              {gateResult.reasons.length ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-destructive">
                  {gateResult.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">All checks passed. Great lighting and framing!</p>
              )}
            </CardContent>
          </Card>
        )}

        {qcMessages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Analysis Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {qcMessages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your Baseline</CardTitle>
            <CardDescription>We only show BMI when weight is known.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Height</p>
              <p className="text-lg font-medium">{formatHeightFromCm(heightCm)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weight</p>
              <p className="text-lg font-medium">{weightDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BMI</p>
              <p className="text-lg font-medium">{bmiDisplay}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button onClick={handleAnalyze} disabled={busy || !canSubmit} className="w-full">
            {stage === "idle" && "Analyze & Spend 1 Credit"}
            {stage === "gating" && "Checking quality..."}
            {stage === "authorizing" && "Reserving credit..."}
            {stage === "analyzing" && "Estimating measurements..."}
            {stage === "saving" && "Saving results..."}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Need help? View <Link className="underline" to="/scan/tips">photo tips</Link>. Quality fails today: {gateFailures}/3.
          </p>
        </div>

        <Separator />

        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Accuracy Tips</p>
          <p>
            Bright, even lighting and a neutral background dramatically improve accuracy. Keep arms slightly away from the body
            and stand ~8 ft from the camera.
          </p>
        </div>
      </main>
    </div>
  );
}
