/**
 * Pipeline map — Photo capture intake:
 * - Enforces the 4 required poses before `ScanPage` can call `startScanSessionClient`.
 * - Provides camera/library pickers, downscales via `resizeImageFile`, and emits blobs to the parent form.
 * - Cleans up blob URLs so we do not leak memory between repeated capture attempts.
 */
import { useEffect, useRef, useState } from "react";
import { POSES, POSE_LABEL, type Pose } from "./poses";
import { resizeImageFile } from "./resizeImage";

export type CaptureReady = {
  front: File | Blob;
  back: File | Blob;
  left: File | Blob;
  right: File | Blob;
};
type Props = {
  onReady: (payload: CaptureReady) => void;
};

type PosePick = { file: File; blob: Blob; url: string };

export default function ScanCapture({ onReady }: Props) {
  const [picks, setPicks] = useState<Partial<Record<Pose, PosePick>>>({});
  const [activePose, setActivePose] = useState<Pose | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picksRef = useRef(picks);

  // Two hidden inputs: one for Camera (capture=environment), one for Library (no capture)
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  function openFor(pose: Pose, source: "camera" | "library") {
    setActivePose(pose);
    setError(null);
    const ref = source === "camera" ? cameraInputRef : libraryInputRef;
    ref.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = ""; // reset for consecutive selections
    if (!file || !activePose) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setBusy(true);
    try {
      // Optional downscale for mobile perf/bandwidth
      const blob = await resizeImageFile(file, 1600, 0.9);
      const url = URL.createObjectURL(blob);
      const pick: PosePick = { file, blob, url };
      setPicks((prev) => {
        // Revoke previous preview URL for this pose to avoid leaks
        const prevPick = prev[activePose];
        if (prevPick?.url) URL.revokeObjectURL(prevPick.url);
        return { ...prev, [activePose]: pick };
      });
      setActivePose(null);
    } catch (err: any) {
      setError(err?.message || "Could not process image.");
    } finally {
      setBusy(false);
    }
  }

  function removePose(pose: Pose) {
    setPicks((prev) => {
      const next = { ...prev };
      const prevPick = next[pose];
      if (prevPick?.url) URL.revokeObjectURL(prevPick.url);
      delete next[pose];
      return next;
    });
  }

  useEffect(() => {
    picksRef.current = picks;
  }, [picks]);

  useEffect(
    () => () => {
      Object.values(picksRef.current).forEach((pick) => {
        if (pick?.url) {
          URL.revokeObjectURL(pick.url);
        }
      });
    },
    []
  );

  const ready = POSES.every((p) => picks[p]);
  async function onContinue() {
    if (!ready) return;
    onReady({
      front: picks.front!.blob,
      back: picks.back!.blob,
      left: picks.left!.blob,
      right: picks.right!.blob,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add four photos: Front, Back, Left, Right. Tip: good lighting, full body
        in frame.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {POSES.map((pose) => {
          const pick = picks[pose];
          return (
            <div key={pose} className="rounded-md border p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{POSE_LABEL[pose]}</span>
                {pick ? (
                  <button
                    onClick={() => removePose(pose)}
                    className="text-[11px] underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded bg-black/5 flex items-center justify-center">
                {pick ? (
                  <img
                    src={pick.url}
                    alt={`${POSE_LABEL[pose]} preview`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No photo
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => openFor(pose, "camera")}
                >
                  Camera
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => openFor(pose, "library")}
                >
                  Photo Library
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Processing image…
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={!ready || busy}
          onClick={onContinue}
          data-testid="scan-continue"
        >
          {busy ? "Please wait…" : "Continue"}
        </button>
        {!ready && (
          <span className="text-xs text-muted-foreground">
            Add all four photos to continue
          </span>
        )}
      </div>

      {/* Hidden file inputs */}
      {/* Rear camera hint for supported devices */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChosen}
        className="hidden"
      />
      {/* Library input intentionally lacks capture attribute to ensure Photo Library option on iOS */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChosen}
        className="hidden"
        data-testid="library-input"
      />
    </div>
  );
}
