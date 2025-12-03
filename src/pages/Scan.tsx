import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startScanSessionClient, submitScanClient } from "@/lib/api/scan";
import { ApiError } from "@/lib/http";
import { useAuthUser } from "@/lib/useAuthUser";

interface PhotoInputs {
  front: File | null;
  back: File | null;
  left: File | null;
  right: File | null;
}

export default function ScanPage() {
  const { user, loading: authLoading } = useAuthUser();
  const nav = useNavigate();
  const [currentWeight, setCurrentWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [photos, setPhotos] = useState<PhotoInputs>({ front: null, back: null, left: null, right: null });
  const [status, setStatus] = useState<"idle" | "starting" | "uploading" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);

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

    const currentWeightKg = Number(currentWeight);
    const goalWeightKg = Number(goalWeight);
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      setError("Please enter valid numbers for your weight goals.");
      return;
    }

    try {
      setStatus("starting");
      const start = await startScanSessionClient({ currentWeightKg, goalWeightKg });

      setStatus("uploading");
      await submitScanClient({
        scanId: start.scanId,
        storagePaths: start.storagePaths,
        photos: {
          front: photos.front!,
          back: photos.back!,
          left: photos.left!,
          right: photos.right!,
        },
        currentWeightKg,
        goalWeightKg,
      });

      setStatus("analyzing");
      nav(`/scan/${start.scanId}`);
    } catch (err: any) {
      setStatus("idle");
      const apiError = err instanceof ApiError ? err : null;
      const code = apiError?.code || (apiError?.data as any)?.code;
      const message = typeof apiError?.data?.message === "string"
        ? apiError.data.message
        : code === "missing_photos"
          ? "We couldn't find your uploads. Please re-upload each photo and try again."
          : code === "invalid_scan_request"
            ? "Missing or invalid scan data."
            : err?.message || "Could not start the scan.";
      setError(message);
    }
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

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Current weight (kg)
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
            Goal weight (kg)
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
          disabled={missingFields || status !== "idle"}
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
