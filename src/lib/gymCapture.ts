const MAX_IMAGE_EDGE = 1024;
const JPEG_QUALITY = 0.72;
const MAX_VIDEO_SECONDS = 45;

function canvasDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number
): string {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_processing_unavailable");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function prepareGymPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("invalid_image");
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return canvasDataUrl(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Older iOS WebViews can decode a camera image with Image even when
      // createImageBitmap rejects its container or metadata.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image_processing_unavailable"));
      image.src = url;
    });
    return canvasDataUrl(
      image,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, handleReady);
      target.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("video_processing_failed"));
    };
    target.addEventListener(event, handleReady, { once: true });
    target.addEventListener("error", handleError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.05) return;
  const ready = waitForEvent(video, "seeked");
  video.currentTime = time;
  await ready;
}

export async function sampleGymVideo(
  file: File,
  frameCount = 5
): Promise<string[]> {
  if (!file.type.startsWith("video/")) throw new Error("invalid_video");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  try {
    await waitForEvent(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("video_duration_unavailable");
    }
    const usableDuration = Math.min(video.duration, MAX_VIDEO_SECONDS);
    const count = Math.max(2, Math.min(6, Math.round(frameCount)));
    const frames: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const ratio = count === 1 ? 0.5 : 0.08 + (0.84 * index) / (count - 1);
      await seek(video, Math.max(0, usableDuration * ratio));
      frames.push(canvasDataUrl(video, video.videoWidth, video.videoHeight));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
