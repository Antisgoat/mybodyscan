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
    if (!ctx) return file;

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
  } catch {
    return file; // worst-case: keep original
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
