/* Lightweight wrappers around @zxing/browser with graceful fallbacks */
export type StopFn = () => void;

let zxingMod: any | null = null;
async function ensureZXing() {
  if (zxingMod) return zxingMod;
  try {
    zxingMod = await import("@zxing/browser");
    return zxingMod;
  } catch {
    return null;
  }
}

type ScannerError = Error & { code?: string };

// FIX: Bubble up typed scanner errors so the UI can explain capability issues instead of showing a generic failure.
function makeError(code: string, message: string): ScannerError {
  const error = new Error(message) as ScannerError;
  error.code = code;
  return error;
}

export function cameraAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function isSecureContextOrLocal(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Boolean(window.isSecureContext) ||
    (typeof location !== "undefined" && location.hostname === "localhost")
  );
}

export async function startVideoScan(
  videoEl: HTMLVideoElement,
  onText: (code: string) => void
): Promise<StopFn | null> {
  const ZX = await ensureZXing();
  if (!ZX) {
    throw makeError("zxing_unavailable", "Scanner dependency failed to load.");
  }
  if (!cameraAvailable()) {
    throw makeError(
      "camera_unsupported",
      "Camera API unavailable in this browser."
    );
  }
  if (!isSecureContextOrLocal()) {
    throw makeError(
      "insecure_context",
      "Camera access requires HTTPS or localhost."
    );
  }

  const { BrowserMultiFormatReader } = ZX;
  const reader = new BrowserMultiFormatReader();

  videoEl.setAttribute("playsinline", "true"); // iOS requirement
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch (error: any) {
    const err = makeError(
      error?.name === "NotAllowedError"
        ? "camera_permission_denied"
        : "camera_start_failed",
      error?.message || "Camera access was blocked."
    );
    throw err;
  }
  videoEl.srcObject = stream;
  await videoEl.play();

  let controls: any;
  try {
    controls = reader.decodeFromVideoDevice(
      undefined,
      videoEl,
      (result: any) => {
        if (result && typeof result.getText === "function") {
          onText(result.getText());
        }
      }
    );
  } catch (error: any) {
    stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
    throw makeError(
      "scanner_start_failed",
      error?.message || "Scanner failed to initialize."
    );
  }

  const stop: StopFn = () => {
    try {
      controls?.stop?.();
    } catch (error) {
      console.warn("zxing_stop_failed", error);
    }
    const tracks =
      (videoEl.srcObject as MediaStream | null)?.getTracks?.() ?? [];
    tracks.forEach((t) => t.stop());
    videoEl.srcObject = null;
  };

  return stop;
}

export async function decodeFromImageFile(file: File): Promise<string | null> {
  const ZX = await ensureZXing();
  if (!ZX) return null;
  const { BrowserMultiFormatReader } = ZX;
  const reader = new BrowserMultiFormatReader();

  const url = URL.createObjectURL(file);
  try {
    const res = await reader.decodeFromImageUrl(url);
    return res?.getText?.() ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
