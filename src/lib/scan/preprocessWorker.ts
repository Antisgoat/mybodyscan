/// <reference lib="webworker" />
const MAX_EDGE_DEFAULT = 1600;
const QUALITY_DEFAULT = 0.8;

type WorkerRequest = {
  id: string;
  buffer: ArrayBuffer;
  type: string;
  maxEdge?: number;
  quality?: number;
};

type WorkerResponse =
  | {
      id: string;
      ok: true;
      buffer: ArrayBuffer;
      size: number;
      width: number;
      height: number;
      orientation: number;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

// eslint-disable-next-line @typescript-eslint/no-misused-promises
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, type, maxEdge, quality } = event.data;
  try {
    const orientation = readJpegExifOrientation(buffer, type);
    const blob = new Blob([buffer], { type });
    const bitmap = await createImageBitmap(blob);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const cap = Math.max(1, Math.min(maxEdge ?? MAX_EDGE_DEFAULT, 3000));
    const scale = Math.min(1, cap / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));
    const swapDims = orientation >= 5 && orientation <= 8;
    const canvas = new OffscreenCanvas(swapDims ? outH : outW, swapDims ? outW : outH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ctx_unavailable");
    applyExifOrientationTransform(ctx, orientation, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    const blobOut = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: clamp01(quality ?? QUALITY_DEFAULT),
    });
    const outBuffer = await blobOut.arrayBuffer();
    const response: WorkerResponse = {
      id,
      ok: true,
      buffer: outBuffer,
      size: blobOut.size,
      width: outW,
      height: outH,
      orientation,
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    self.postMessage(response, { transfer: [outBuffer] });
  } catch (err: any) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: err?.message || String(err),
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    self.postMessage(response);
  }
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return QUALITY_DEFAULT;
  return Math.max(0, Math.min(1, value));
}

function applyExifOrientationTransform(
  ctx: OffscreenCanvasRenderingContext2D,
  orientation: number,
  canvasW: number,
  canvasH: number
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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

function readJpegExifOrientation(buf: ArrayBuffer, mimeType?: string): number {
  const type = (mimeType || "").toLowerCase();
  const isJpeg = type === "image/jpeg" || type === "image/pjpeg";
  if (!isJpeg || buf.byteLength < 4) return 1;
  const view = new DataView(buf);
  if (view.getUint16(0, false) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffe1) {
      const size = view.getUint16(offset, false);
      offset += 2;
      if (
        offset + 6 > view.byteLength ||
        view.getUint32(offset, false) !== 0x45786966 ||
        view.getUint16(offset + 4, false) !== 0x0000
      ) {
        offset += size - 2;
        continue;
      }
      offset += 6;
      const tiffOffset = offset;
      const endian = view.getUint16(tiffOffset, false);
      const little = endian === 0x4949;
      if (!little && endian !== 0x4d4d) return 1;
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
        if (tag !== 0x0112) continue;
        const format = view.getUint16(entryOffset + 2, little);
        const components = view.getUint32(entryOffset + 4, little);
        if (format !== 3 || components !== 1) return 1;
        const value = view.getUint16(entryOffset + 8, little);
        return value >= 1 && value <= 8 ? value : 1;
      }
      return 1;
    }
    if (marker === 0xffda || marker === 0xffd9) break;
    const segmentLength = view.getUint16(offset, false);
    offset += segmentLength;
  }
  return 1;
}
