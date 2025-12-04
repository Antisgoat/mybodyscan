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

export function cameraAvailable(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function isSecureContextOrLocal(): boolean {
  return window.isSecureContext || location.hostname === "localhost";
}

export async function startVideoScan(
  videoEl: HTMLVideoElement,
  onText: (code: string) => void
): Promise<StopFn | null> {
  const ZX = await ensureZXing();
  if (!ZX || !cameraAvailable() || !isSecureContextOrLocal()) return null;

  const { BrowserMultiFormatReader } = ZX;
  const reader = new BrowserMultiFormatReader();

  videoEl.setAttribute("playsinline", "true"); // iOS requirement
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const controls = reader.decodeFromVideoDevice(undefined, videoEl, (result: any) => {
    if (result && typeof result.getText === "function") {
      onText(result.getText());
    }
  });

  const stop: StopFn = () => {
    try {
      controls?.stop?.();
    } catch (error) {
      console.warn("zxing_stop_failed", error);
    }
    const tracks = (videoEl.srcObject as MediaStream | null)?.getTracks?.() ?? [];
    tracks.forEach(t => t.stop());
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
