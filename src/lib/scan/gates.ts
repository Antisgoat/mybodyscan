export type GateResult = {
  pass: boolean;
  score: number;
  reasons: string[];
};

interface LoadedImage {
  width: number;
  height: number;
  data: ImageData;
}

const MIN_LONG_EDGE = 1080;
const MIN_CONTRAST = 18;
const MIN_SHARPNESS = 14;
const BRIGHTNESS_RANGE: [number, number] = [40, 215];
const ASPECT_RANGE: [number, number] = [0.5, 2.5];

function ensureCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Canvas unavailable in this environment");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function loadImageData(file: File): Promise<LoadedImage> {
  if (typeof window === "undefined") {
    throw new Error("Browser APIs required for image analysis");
  }
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (event) => reject(event instanceof ErrorEvent ? event.error : new Error("image_load_failed"));
    img.src = url;
  });
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = ensureCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  URL.revokeObjectURL(url);
  return { width, height, data };
}

function laplacianVariance(image: ImageData) {
  const { data, width, height } = image;
  let total = 0;
  let totalSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const c = luminance(data[idx], data[idx + 1], data[idx + 2]);
      const leftIdx = (y * width + (x - 1)) * 4;
      const rightIdx = (y * width + (x + 1)) * 4;
      const topIdx = ((y - 1) * width + x) * 4;
      const bottomIdx = ((y + 1) * width + x) * 4;
      const lap =
        luminance(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]) +
        luminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]) +
        luminance(data[topIdx], data[topIdx + 1], data[topIdx + 2]) +
        luminance(data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]) -
        4 * c;
      total += lap;
      totalSq += lap * lap;
      count += 1;
    }
  }
  if (!count) return 0;
  const mean = total / count;
  return totalSq / count - mean * mean;
}

interface SilhouetteMetrics {
  brightness: number;
  contrast: number;
  sharpness: number;
  aspectRatio: number;
  centerOffsetRatio: number;
  subjectCoverage: number;
  subjectHeightPx: number;
  shoulderWidth: number;
  waistWidth: number;
  hipWidth: number;
  height: number;
  width: number;
}

export type GateEvaluationInput = SilhouetteMetrics & {
  longEdge: number;
  imageIndex: number;
};

function analyseSilhouette(image: LoadedImage): SilhouetteMetrics {
  const pixelData = image.data.data;
  const { width, height } = image;
  const totalPixels = width * height;
  const rowLeft = new Array<number>(height).fill(width);
  const rowRight = new Array<number>(height).fill(-1);
  let sum = 0;
  let sumSq = 0;
  let subjectPixels = 0;
  let subjectSumX = 0;
  let subjectTop = height;
  let subjectBottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const l = luminance(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]);
      sum += l;
      sumSq += l * l;
      if (l < 235) {
        subjectPixels += 1;
        subjectSumX += x;
        if (rowLeft[y] > x) rowLeft[y] = x;
        if (rowRight[y] < x) rowRight[y] = x;
        if (subjectTop > y) subjectTop = y;
        if (subjectBottom < y) subjectBottom = y;
      }
    }
  }

  const mean = sum / totalPixels;
  const variance = sumSq / totalPixels - mean * mean;
  const contrast = Math.sqrt(Math.max(variance, 0));

  let shoulderWidth = 0;
  let waistWidth = 0;
  let hipWidth = 0;
  const bodyHeight = Math.max(subjectBottom - subjectTop, 0);

  const sampleBand = (ratio: number) => {
    if (bodyHeight <= 0) return 0;
    const y = Math.min(height - 1, Math.max(0, Math.round(subjectTop + bodyHeight * ratio)));
    const left = rowLeft[y];
    const right = rowRight[y];
    if (left >= right || left === width || right < 0) return 0;
    return right - left;
  };

  shoulderWidth = sampleBand(0.22);
  waistWidth = sampleBand(0.48);
  hipWidth = sampleBand(0.62);

  const coverage = subjectPixels / totalPixels;
  const centerX = subjectPixels ? subjectSumX / subjectPixels : width / 2;
  const centerOffsetRatio = Math.abs(centerX - width / 2) / width;

  return {
    brightness: mean,
    contrast,
    sharpness: laplacianVariance(image.data),
    aspectRatio: height / width,
    centerOffsetRatio,
    subjectCoverage: coverage,
    subjectHeightPx: bodyHeight,
    shoulderWidth,
    waistWidth,
    hipWidth,
    height,
    width,
  };
}

export function evaluateGateMetrics(input: GateEvaluationInput): { score: number; reasons: string[] } {
  const reasons = new Set<string>();
  let localScore = 1;
  const longEdge = input.longEdge;

  if (longEdge < MIN_LONG_EDGE) {
    reasons.add("Use a higher-resolution photo (long edge ≥1080px)");
    localScore -= 0.35;
  }
  if (input.aspectRatio < ASPECT_RANGE[0] || input.aspectRatio > ASPECT_RANGE[1]) {
    reasons.add("Retake in portrait orientation with full body visible");
    localScore -= 0.15;
  }
  if (input.brightness < BRIGHTNESS_RANGE[0] || input.brightness > BRIGHTNESS_RANGE[1]) {
    reasons.add("Adjust lighting so the subject is evenly lit");
    localScore -= 0.2;
  }
  if (input.contrast < MIN_CONTRAST) {
    reasons.add("Increase contrast with a neutral background");
    localScore -= 0.2;
  }
  if (input.sharpness < MIN_SHARPNESS) {
    reasons.add("Photo is blurry — steady the camera and retake");
    localScore -= 0.25;
  }
  if (input.centerOffsetRatio > 0.18) {
    reasons.add("Stand centered in the frame");
    localScore -= 0.1;
  }
  if (input.subjectCoverage < 0.18 || input.subjectCoverage > 0.6) {
    reasons.add("Stand closer so your body fills most of the frame");
    localScore -= 0.1;
  }
  if (input.subjectHeightPx < input.height * 0.6) {
    reasons.add("Ensure your full body from head to toe is visible");
    localScore -= 0.2;
  }

  if (input.imageIndex === 0) {
    const shoulderToWaist = input.waistWidth > 0 ? input.shoulderWidth / input.waistWidth : 0;
    if (!Number.isFinite(shoulderToWaist) || shoulderToWaist < 1.02) {
      reasons.add("Raise arms slightly so they are visible away from the torso");
      localScore -= 0.15;
    }
    if (input.waistWidth <= 0 || input.hipWidth <= 0) {
      reasons.add("Torso not detected — try a cleaner background");
      localScore -= 0.2;
    }
  }

  return { score: Math.max(0, Math.min(1, localScore)), reasons: Array.from(reasons) };
}

export async function clientQualityGate(files: File[]): Promise<GateResult> {
  if (!files.length) {
    return { pass: false, score: 0, reasons: ["Add the required photos before submitting"] };
  }

  const reasons = new Set<string>();
  let scoreSum = 0;

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const img = await loadImageData(file);
    const metrics = analyseSilhouette(img);
    const evaluation = evaluateGateMetrics({
      ...metrics,
      longEdge: Math.max(metrics.width, metrics.height),
      imageIndex: index,
    });
    evaluation.reasons.forEach((reason) => reasons.add(reason));
    scoreSum += evaluation.score;
  }

  const score = Math.max(0, Math.min(1, scoreSum / files.length));
  const pass = score >= 0.7 && reasons.size === 0;
  return { pass, score, reasons: Array.from(reasons) };
}

export async function computeImageHash(file: File): Promise<string> {
  const img = await loadImageData(file);
  const size = 8;
  const canvas = ensureCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");
  const tmp = ensureCanvas(img.width, img.height);
  const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
  if (!tmpCtx) throw new Error("Canvas context unavailable");
  tmpCtx.putImageData(img.data, 0, 0);
  ctx.drawImage(tmp, 0, 0, size, size);
  const resized = ctx.getImageData(0, 0, size, size);
  const pixels = resized.data;
  let sum = 0;
  const grays: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
    grays.push(gray);
    sum += gray;
  }
  const avg = sum / grays.length;
  let bits = "";
  for (const gray of grays) {
    bits += gray >= avg ? "1" : "0";
  }
  const chunks = bits.match(/.{1,4}/g) || [];
  return chunks
    .map((chunk) => parseInt(chunk.padEnd(4, "0"), 2).toString(16))
    .join("");
}
