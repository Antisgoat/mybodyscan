import { useEffect, useRef, useState } from "react";
import { cameraAvailable, isSecureContextOrLocal, startVideoScan, decodeFromImageFile, type StopFn } from "./useZxing";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  onCapabilityChange?: (state: { supported: boolean; reason?: "blocked" | "unsupported" }) => void;
};

export default function BarcodeScannerSheet({ open, onClose, onDetected, onCapabilityChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<StopFn | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraBlockReason, setCameraBlockReason] = useState<"blocked" | "unsupported" | null>(null);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!open) return;
      setError(null);
      setScanning(false);
      stopRef.current?.();
      stopRef.current = null;
      if (cameraBlockReason === "blocked") {
        // FIX: Stop re-requesting camera once Safari blocks permission and explain how to resolve.
        setError("Camera permission is blocked for this site. Enable camera access in Safari Settings to scan.");
        onCapabilityChange?.({ supported: false, reason: "blocked" });
        return;
      }
      if (cameraBlockReason === "unsupported") {
        setError("Live camera scanning isn't supported on this device. Enter the barcode manually.");
        onCapabilityChange?.({ supported: false, reason: "unsupported" });
        return;
      }
      if (!cameraAvailable()) {
        setError("Live camera scanning isn't supported on this device. Enter the barcode manually.");
        setCameraBlockReason("unsupported");
        onCapabilityChange?.({ supported: false, reason: "unsupported" });
        return;
      }
      if (!isSecureContextOrLocal()) {
        setError("Camera access requires HTTPS or localhost. Enter the barcode manually.");
        setCameraBlockReason("unsupported");
        onCapabilityChange?.({ supported: false, reason: "unsupported" });
        return;
      }
      if (!videoRef.current) return;

      setScanning(true);
      try {
        const stop = await startVideoScan(videoRef.current, (code) => {
          // Debounce: stop immediately on first detection
          if (!mounted) return;
          stopRef.current?.();
          stopRef.current = null;
          setScanning(false);
          // Best-effort haptic
          try {
            (navigator as any).vibrate?.(60);
          } catch (error) {
            console.debug("barcode_vibrate_failed", error);
          }
          onDetected(code);
          onClose();
        });
        stopRef.current = stop;
        onCapabilityChange?.({ supported: true });
      } catch (err: any) {
        // FIX: Translate ZXing/camera failures into actionable messaging instead of a generic error.
        if (!mounted) return;
        setScanning(false);
        const code = err?.code ?? err?.name;
        if (code === "camera_permission_denied" || code === "NotAllowedError") {
          setCameraBlockReason("blocked");
          setError("Camera permission is blocked for this site. Enable camera access in Safari Settings > Safari > Camera.");
          onCapabilityChange?.({ supported: false, reason: "blocked" });
        } else if (code === "camera_unsupported") {
          setCameraBlockReason("unsupported");
          setError("Live camera scanning isn't supported in this browser. Enter the barcode manually.");
          onCapabilityChange?.({ supported: false, reason: "unsupported" });
        } else if (code === "insecure_context") {
          setCameraBlockReason("unsupported");
          setError("Camera access requires HTTPS or localhost. Enter the barcode manually.");
          onCapabilityChange?.({ supported: false, reason: "unsupported" });
        } else if (code === "zxing_unavailable") {
          setError("Scanner component unavailable on this device. Use manual entry or upload a barcode photo.");
        } else {
          setError("Unable to start camera scanner. You can still enter the barcode manually.");
        }
      }
    }
    run();
    return () => {
      mounted = false;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [open, onClose, onDetected, cameraBlockReason]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const code = await decodeFromImageFile(f);
    if (code) {
      onDetected(code);
      onClose();
    } else {
      setError("Could not read barcode from photo. Try better lighting or the manual option.");
    }
    e.currentTarget.value = ""; // reset
  }

  function submitManual() {
    const code = manualCode.trim();
    if (!code) return;
    onDetected(code);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/30">
      <div className="w-full md:max-w-md rounded-t-lg md:rounded-lg bg-white shadow-lg">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-medium">Scan barcode</h3>
          <button onClick={onClose} className="text-xs underline">Close</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-md border aspect-video overflow-hidden bg-black/5 flex items-center justify-center">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          </div>

          {scanning && <p className="text-xs text-muted-foreground">Point your camera at the barcode…</p>}
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block">Manual entry</span>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g., 012345678905"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="w-full rounded-md border px-2 py-1 text-sm"
                />
                <button onClick={submitManual} className="rounded-md border px-3 py-1 text-sm">Go</button>
              </div>
            </label>

            <label className="text-xs">
              <span className="mb-1 block">Upload photo of barcode</span>
              <input
                type="file"
                accept="image/*"
                onChange={onPickFile}
                className="block w-full text-xs"
              />
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: iPhone Safari requires HTTPS and will keep video inline (no full‑screen). Good lighting helps.
          </p>
        </div>
      </div>
    </div>
  );
}
