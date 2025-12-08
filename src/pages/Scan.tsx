import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startScanSessionClient, submitScanClient } from "@/lib/api/scan";
import { useAuthUser } from "@/lib/useAuthUser";
import { useUnits } from "@/hooks/useUnits";
import { lbToKg } from "@/lib/units";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useSystemHealth } from "@/hooks/useSystemHealth";

interface PhotoInputs {
  front: File | null;
  back: File | null;
  left: File | null;
  right: File | null;
}

export default function ScanPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { units } = useUnits();
  const nav = useNavigate();
  const [currentWeight, setCurrentWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [photos, setPhotos] = useState<PhotoInputs>({ front: null, back: null, left: null, right: null });
  const [status, setStatus] = useState<"idle" | "starting" | "uploading" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  const { health: systemHealth } = useSystemHealth();
  const { statuses } = computeFeatureStatuses({
    scanConfigured: systemHealth?.openaiConfigured,
    coachConfigured: systemHealth?.openaiConfigured,
    nutritionConfigured: systemHealth?.nutritionConfigured,
  });
  const scanConfigured =
    systemHealth?.openaiConfigured ?? statuses.find((status) => status.id === "scans")?.configured !== false;

  useEffect(() => {
    if (!authLoading && !user) nav("/auth?next=/scan");
  }, [authLoading, user, nav]);

  const missingFields = useMemo(() => {
    return !currentWeight || !goalWeight || !photos.front || !photos.back || !photos.left || !photos.right;
  }, [currentWeight, goalWeight, photos]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (missingFields) {
      setError("Please add all four photos and enter your weights.");
      return;
    }

    const toKg = (value: string): number => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return Number.NaN;
      return units === "us" ? lbToKg(numeric) : numeric;
    };

    const currentWeightKg = toKg(currentWeight);
    const goalWeightKg = toKg(goalWeight);
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      setError("Please enter valid numbers for your weight goals.");
      return;
    }
    if (!scanConfigured) {
      setError(
        systemHealth?.openaiConfigured === false
          ? "Scan is unavailable because the AI engine (OPENAI_API_KEY) is not configured."
          : "Body scans are offline until the functions URL is configured.",
      );
      return;
    }
    setStatus("starting");
    const start = await startScanSessionClient({ currentWeightKg, goalWeightKg });
    if (!start.ok) {
      const debugSuffix = start.error.debugId ? ` (ref ${start.error.debugId.slice(0, 8)})` : "";
      setError(start.error.message + debugSuffix);
      setStatus("idle");
      return;
    }

    setStatus("uploading");
    const submit = await submitScanClient({
      scanId: start.data.scanId,
      storagePaths: start.data.storagePaths,
      photos: {
        front: photos.front!,
        back: photos.back!,
        left: photos.left!,
        right: photos.right!,
      },
      currentWeightKg,
      goalWeightKg,
    });

    if (!submit.ok) {
      const debugSuffix = submit.error.debugId ? ` (ref ${submit.error.debugId.slice(0, 8)})` : "";
      setError(submit.error.message + debugSuffix);
      setStatus("idle");
      return;
    }

    setStatus("analyzing");
    nav(`/scan/${start.data.scanId}`);
  }

  function onFileChange(pose: keyof PhotoInputs, fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setPhotos((prev) => ({ ...prev, [pose]: file }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">AI Body Scan</h1>
      <p className="text-sm text-muted-foreground">
        Upload four photos and your current/goal weight. We&apos;ll analyze your body composition and build a personalized workout
        and nutrition plan.
      </p>

      {!scanConfigured && (
        <Alert variant="destructive">
          <AlertTitle>Scan unavailable</AlertTitle>
          <AlertDescription>
            {systemHealth?.openaiConfigured === false
              ? "Scan is unavailable because the AI engine (OPENAI_API_KEY) is not configured on the server."
              : "Scans are offline until the Cloud Functions base URL is configured. Ask an admin to set VITE_FUNCTIONS_URL or the dedicated scan endpoints before trying again."}
          </AlertDescription>
        </Alert>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Current weight ({units === "us" ? "lb" : "kg"})
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Goal weight ({units === "us" ? "lb" : "kg"})
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              className="rounded border px-3 py-2 text-base"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["front", "back", "left", "right"] as Array<keyof PhotoInputs>).map((pose) => (
            <label key={pose} className="flex flex-col gap-2 rounded border p-3 text-sm font-medium capitalize">
              {pose}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange(pose, e.target.files)}
                className="text-xs"
              />
              {photos[pose] ? (
                <span className="text-xs text-muted-foreground">{photos[pose]?.name}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Upload a clear {pose} photo</span>
              )}
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={missingFields || status !== "idle" || !scanConfigured}
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {status === "starting" && "Starting scan…"}
          {status === "uploading" && "Uploading photos…"}
          {status === "analyzing" && "Analyzing your scan…"}
          {status === "idle" && "Analyze scan"}
        </button>
      </form>
    </div>
  );
}
