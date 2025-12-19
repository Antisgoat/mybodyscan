// Pipeline map — upload pre-processing (mandatory):
// - Converts to JPEG, downscales so the longest edge is <= 1800px, and keeps quality ~0.8.
// - Preserves correct iPhone orientation by applying EXIF Orientation transforms.
// - Tries to keep output under ~3MB per photo (for mobile reliability).
export async function resizeImageFile(
  file: File,
  maxEdge = 1800,
  quality = 0.8
): Promise<Blob> {
  try {
    const orientation = await readJpegExifOrientation(file).catch(() => 1);
    const source = await decodeToImageSource(file);
    const srcW = source.width;
    const srcH = source.height;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));

    let outW = Math.max(1, Math.round(srcW * scale));
    let outH = Math.max(1, Math.round(srcH * scale));

    // Some orientations swap width/height after rotation.
    const swapDims = orientation >= 5 && orientation <= 8;
    const canvas = document.createElement("canvas");
    canvas.width = swapDims ? outH : outW;
    canvas.height = swapDims ? outW : outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Couldn’t prepare photo on this device");
    }

    // Reduce interpolation artifacts when downscaling.
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";

    applyExifOrientationTransform(ctx, orientation, canvas.width, canvas.height);
    ctx.drawImage(source.el, 0, 0, outW, outH);

    // Encode with a small "keep under 3MB" loop.
    const targetBytes = 3 * 1024 * 1024;
    let q = clamp01(quality);
    let blob = await canvasToJpeg(canvas, q);
    // If still too big, reduce quality and (as a last resort) downscale further.
    let safety = 0;
    while (blob.size > targetBytes && safety < 8) {
      safety += 1;
      if (q > 0.62) {
        q = Math.max(0.62, q - 0.06);
        blob = await canvasToJpeg(canvas, q);
        continue;
      }
      // Further downscale if needed.
      const nextEdge = Math.max(1100, Math.round(Math.max(outW, outH) * 0.9));
      if (nextEdge >= Math.max(outW, outH)) break;
      const nextScale = nextEdge / Math.max(outW, outH);
      outW = Math.max(1, Math.round(outW * nextScale));
      outH = Math.max(1, Math.round(outH * nextScale));
      canvas.width = swapDims ? outH : outW;
      canvas.height = swapDims ? outW : outH;
      applyExifOrientationTransform(ctx, orientation, canvas.width, canvas.height);
      ctx.drawImage(source.el, 0, 0, outW, outH);
      blob = await canvasToJpeg(canvas, q);
    }

    source.cleanup?.();
    return blob;
  } catch (err) {
    // No silent fallback — never return the original file/blob (often huge PNGs on iOS).
    throw new Error(
      (err as Error)?.message?.includes("Couldn’t prepare")
        ? (err as Error).message
        : "Couldn’t prepare photo on this device"
    );
  }
}

export type UploadPreprocessMeta = {
  name: string;
  size: number;
  type: string;
};

export type UploadPreprocessResult = {
  original: UploadPreprocessMeta;
  compressed: UploadPreprocessMeta;
  file: File; // always a JPEG file (never the original)
  debug: {
    device: {
      isMobileUploadDevice: boolean;
      isProbablyMobileSafari: boolean;
      userAgent: string;
      maxTouchPoints: number;
      viewport: { width: number; height: number };
    };
    orientation: number;
    srcWidth: number;
    srcHeight: number;
    maxEdgeInitial: number;
    maxEdgeFinal: number;
    qualityInitial: number;
    qualityFinal: number;
    outputBytesLimit: number;
    steps: Array<{
      maxEdge: number;
      quality: number;
      blobBytes: number | null;
      toBlobNull: boolean;
    }>;
  };
};

function toMeta(file: File): UploadPreprocessMeta {
  return {
    name: file.name || "image",
    size: typeof file.size === "number" ? file.size : 0,
    type: (file.type || "").trim() || "application/octet-stream",
  };
}

export function isProbablyMobileSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  if (!isIOS) return false;
  // iOS Chrome/Firefox use WebKit but include markers.
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  const isEdgiOS = /EdgiOS/i.test(ua);
  if (isCriOS || isFxiOS || isEdgiOS) return false;
  // iOS Safari typically has Safari but not Chrome.
  return /Safari/i.test(ua);
}

export function isMobileUploadDevice(): boolean {
  // Aggressive preprocessing is required on iPhone / mobile Safari, and we also
  // apply it to "mobile-like" devices (touch + small viewport) to keep uploads fast.
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const touchPoints =
    typeof (navigator as any).maxTouchPoints === "number"
      ? Number((navigator as any).maxTouchPoints)
      : 0;
  const smallViewport =
    typeof window.innerWidth === "number" ? window.innerWidth <= 900 : false;
  const iosSafari = isProbablyMobileSafari();
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  // If it walks like a phone (touch + small viewport), treat it as mobile for uploads.
  return iosSafari || (touchPoints > 0 && smallViewport) || (isIOS && touchPoints > 0);
}

type DrawParams = {
  source: ImageSource;
  orientation: number;
  maxEdge: number;
};

function drawToCanvas(params: DrawParams): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  swapDims: boolean;
} {
  const srcW = params.source.width;
  const srcH = params.source.height;
  const scale = Math.min(1, params.maxEdge / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const swapDims = params.orientation >= 5 && params.orientation <= 8;

  const canvas = document.createElement("canvas");
  canvas.width = swapDims ? outH : outW;
  canvas.height = swapDims ? outW : outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering unavailable.");
  }
  // Reduce interpolation artifacts when downscaling.
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";
  applyExifOrientationTransform(ctx, params.orientation, canvas.width, canvas.height);
  ctx.drawImage(params.source.el, 0, 0, outW, outH);
  return { canvas, ctx, outW, outH, swapDims };
}

async function canvasToJpegMaybe(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? null),
      "image/jpeg",
      clamp01(quality)
    );
  });
}

/**
 * Mandatory upload pipeline:
 * - Always returns a JPEG `File` (never the original input file).
 * - Uses createImageBitmap when available; falls back to <img>.
 * - iOS Safari: default max edge 1280px; desktop: 1800px.
 * - Starts at quality 0.8; if still > 2.5MB, tries lower quality and/or smaller size.
 * - If canvas.toBlob returns null (iOS bug), retries automatically with smaller size.
 */
export async function preprocessImageForUpload(
  file: File,
  options?: {
    fileName?: string;
    maxEdgeDesktop?: number;
    maxEdgeMobileSafari?: number;
    jpegQualityStart?: number;
    outputBytesLimit?: number;
  }
): Promise<UploadPreprocessResult> {
  const original = toMeta(file);
  const maxEdgeDesktop = options?.maxEdgeDesktop ?? 1800;
  const maxEdgeMobileSafari = options?.maxEdgeMobileSafari ?? 1280;
  const mobile = isMobileUploadDevice();
  const maxEdgeInitial = mobile ? maxEdgeMobileSafari : maxEdgeDesktop;
  const qualityInitial = clamp01(
    options?.jpegQualityStart ?? (mobile ? 0.72 : 0.8)
  );
  // Hard cap for scan uploads: <= 2.0MB.
  const outputBytesLimit =
    options?.outputBytesLimit ?? Math.round(2.0 * 1024 * 1024);

  const orientation = await readJpegExifOrientation(file).catch(() => 1);
  const source = await decodeToImageSource(file);

  const debug: UploadPreprocessResult["debug"] = {
    device: {
      isMobileUploadDevice: mobile,
      isProbablyMobileSafari: isProbablyMobileSafari(),
      userAgent:
        typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "",
      maxTouchPoints:
        typeof navigator !== "undefined" &&
        typeof (navigator as any).maxTouchPoints === "number"
          ? Number((navigator as any).maxTouchPoints)
          : 0,
      viewport: {
        width: typeof window !== "undefined" ? Number(window.innerWidth || 0) : 0,
        height: typeof window !== "undefined" ? Number(window.innerHeight || 0) : 0,
      },
    },
    orientation,
    srcWidth: source.width,
    srcHeight: source.height,
    maxEdgeInitial,
    maxEdgeFinal: maxEdgeInitial,
    qualityInitial,
    qualityFinal: qualityInitial,
    outputBytesLimit,
    steps: [],
  };

  // Candidate max-edges. We always try the initial choice first, then fall back.
  // Keep this conservative; iOS Safari can OOM on large canvases.
  const edgeCandidates = [
    maxEdgeInitial,
    Math.min(maxEdgeInitial, 1280),
    1024,
    900,
    768,
  ]
    .filter((n, i, arr) => Number.isFinite(n) && n > 0 && arr.indexOf(n) === i)
    .sort((a, b) => b - a); // try larger first

  const qualityCandidates = [
    qualityInitial,
    Math.min(qualityInitial, 0.7),
    Math.min(qualityInitial, 0.65),
    Math.min(qualityInitial, 0.6),
    Math.min(qualityInitial, 0.55),
  ].filter((q, i, arr) => q > 0 && q <= 1 && arr.indexOf(q) === i);

  let bestBlob: Blob | null = null;
  let bestEdge = maxEdgeInitial;
  let bestQuality = qualityInitial;

  try {
    for (const edge of edgeCandidates) {
      const { canvas } = drawToCanvas({ source, orientation, maxEdge: edge });
      for (const q of qualityCandidates) {
        const blob = await canvasToJpegMaybe(canvas, q);
        const blobBytes = blob ? blob.size : null;
        debug.steps.push({
          maxEdge: edge,
          quality: q,
          blobBytes,
          toBlobNull: blob == null,
        });

        // iOS can return null; treat as retry signal with smaller size.
        if (!blob) continue;
        // Some buggy implementations return a 0-byte blob; treat as failure.
        if (!Number.isFinite(blob.size) || blob.size <= 0) continue;

        // Accept immediately if under limit.
        if (blob.size <= outputBytesLimit) {
          bestBlob = blob;
          bestEdge = edge;
          bestQuality = q;
          break;
        }

        // Track best-so-far even if it exceeds limit (so we can still proceed).
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
          bestEdge = edge;
          bestQuality = q;
        }
      }
      if (bestBlob && bestBlob.size <= outputBytesLimit) break;
      // If toBlob returned null for all qualities at this size, move to smaller edge.
    }

    if (!bestBlob || bestBlob.size <= 0) {
      throw new Error("Image encoding failed (JPEG blob unavailable).");
    }

    // Hard-cap enforcement: if we're still above the limit, keep reducing quality and/or size
    // until we fall under <= outputBytesLimit (or hit conservative minimums).
    if (bestBlob.size > outputBytesLimit) {
      let edge = bestEdge;
      let q = bestQuality;
      let safety = 0;
      const minEdge = 640;
      const minQuality = 0.5;
      while (bestBlob.size > outputBytesLimit && safety < 18) {
        safety += 1;
        // Prefer lowering quality first (cheap), then downscale (more expensive).
        if (q > minQuality) {
          q = Math.max(minQuality, Number((q - 0.05).toFixed(2)));
        } else {
          edge = Math.max(minEdge, Math.round(edge * 0.85));
          // reset quality slightly upward after downscale so we don't over-crush.
          q = Math.max(minQuality, Math.min(q + 0.05, qualityInitial));
        }
        const { canvas } = drawToCanvas({ source, orientation, maxEdge: edge });
        const blob = await canvasToJpegMaybe(canvas, q);
        debug.steps.push({
          maxEdge: edge,
          quality: q,
          blobBytes: blob ? blob.size : null,
          toBlobNull: blob == null,
        });
        if (!blob || !Number.isFinite(blob.size) || blob.size <= 0) continue;
        bestBlob = blob;
        bestEdge = edge;
        bestQuality = q;
      }
      if (bestBlob.size > outputBytesLimit) {
        throw new Error("Couldn’t prepare photo on this device");
      }
    }

    const outName = (options?.fileName || "upload.jpg").replace(/\.(png|webp|heic|heif|jpeg|jpg)$/i, ".jpg");
    const outFile = new File([bestBlob], outName, { type: "image/jpeg" });

    debug.maxEdgeFinal = bestEdge;
    debug.qualityFinal = bestQuality;

    return {
      original,
      compressed: toMeta(outFile),
      file: outFile,
      debug,
    };
  } finally {
    source.cleanup?.();
  }
}

export type ScanPhotoView = "front" | "back" | "left" | "right";

export async function prepareScanPhoto(
  file: File,
  view: ScanPhotoView
): Promise<{ preparedFile: File; meta: { original: UploadPreprocessMeta; prepared: UploadPreprocessMeta; debug: UploadPreprocessResult["debug"] } }> {
  try {
    const processed = await preprocessImageForUpload(file, {
      fileName: `${view}.jpg`,
      maxEdgeDesktop: 1800,
      maxEdgeMobileSafari: 1280,
      // Mobile uses aggressive quality; desktop defaults handled inside preprocessImageForUpload.
      jpegQualityStart: isMobileUploadDevice() ? 0.72 : 0.8,
      outputBytesLimit: Math.round(2.0 * 1024 * 1024),
    });
    return {
      preparedFile: processed.file,
      meta: {
        original: processed.original,
        prepared: processed.compressed,
        debug: processed.debug,
      },
    };
  } catch (err) {
    // Do not fall back to original files (often huge PNGs / HEIC).
    throw new Error(
      (err as Error)?.message?.includes("Couldn’t prepare")
        ? (err as Error).message
        : "Couldn’t prepare photo on this device"
    );
  }
}

type ImageSource = {
  el: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
};

async function decodeToImageSource(file: File): Promise<ImageSource> {
  // Prefer createImageBitmap to avoid iOS Safari EXIF quirks with <img> decoding.
  if (typeof window !== "undefined" && "createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        el: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // fallback below
    }
  }
  const img = await fileToImage(file);
  return { el: img, width: img.naturalWidth, height: img.naturalHeight };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? new Blob()),
      "image/jpeg",
      clamp01(quality)
    );
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function applyExifOrientationTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  canvasW: number,
  canvasH: number
) {
  // Reset any existing transforms
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Map EXIF orientation to canvas transform.
  // 1: normal
  // 2: mirror horizontal
  // 3: rotate 180
  // 4: mirror vertical
  // 5: mirror horizontal + rotate 90 CW
  // 6: rotate 90 CW
  // 7: mirror horizontal + rotate 90 CCW
  // 8: rotate 90 CCW
  switch (orientation) {
    case 2:
      ctx.translate(canvasW, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(canvasW, canvasH);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, canvasH);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -canvasH);
      break;
    case 7:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(canvasW, -canvasH);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-canvasW, 0);
      break;
    default:
      break;
  }
}

async function readJpegExifOrientation(file: File): Promise<number> {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const isJpeg =
    type === "image/jpeg" ||
    type === "image/pjpeg" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg");
  if (!isJpeg) return 1;

  // Read a small prefix; EXIF lives near the beginning.
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buf);
  // JPEG SOI
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    // APP1 marker
    if (marker === 0xffe1) {
      const size = view.getUint16(offset, false);
      offset += 2;
      // "Exif\0\0"
      if (offset + 6 > view.byteLength) return 1;
      if (
        view.getUint32(offset, false) !== 0x45786966 || // "Exif"
        view.getUint16(offset + 4, false) !== 0x0000
      ) {
        offset += size - 2;
        continue;
      }
      offset += 6;
      const tiffOffset = offset;
      const endian = view.getUint16(tiffOffset, false);
      const little = endian === 0x4949; // "II"
      if (!little && endian !== 0x4d4d) return 1; // "MM"
      // Validate TIFF magic 42
      if (view.getUint16(tiffOffset + 2, little) !== 0x002a) return 1;
      const ifd0Offset = view.getUint32(tiffOffset + 4, little);
      let dirOffset = tiffOffset + ifd0Offset;
      if (dirOffset + 2 > view.byteLength) return 1;
      const entries = view.getUint16(dirOffset, little);
      dirOffset += 2;
      for (let i = 0; i < entries; i += 1) {
        const entryOffset = dirOffset + i * 12;
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, little);
        if (tag !== 0x0112) continue; // Orientation
        const format = view.getUint16(entryOffset + 2, little);
        const components = view.getUint32(entryOffset + 4, little);
        // Expect SHORT (3) with 1 component.
        if (format !== 3 || components !== 1) return 1;
        const value = view.getUint16(entryOffset + 8, little);
        return value >= 1 && value <= 8 ? value : 1;
      }
      return 1;
    }
    // SOS or EOI => stop
    if (marker === 0xffda || marker === 0xffd9) break;
    const segmentLength = view.getUint16(offset, false);
    offset += segmentLength;
  }
  return 1;
}
