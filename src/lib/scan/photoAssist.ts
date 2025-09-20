export type PhotoMode = "2" | "4";

export type PhotoInputs = {
  mode: PhotoMode;
  front: File;
  side: File;
  back?: File;
  left?: File;
  right?: File;
  heightCm: number;
  sex: "male" | "female";
};

interface LoadedImage {
  width: number;
  height: number;
  data: ImageData;
}

interface BandMetrics {
  ratio: number;
  widthPx: number;
}

interface SilhouetteBands {
  subjectHeightPx: number;
  bandWidths: Record<string, BandMetrics>;
  clarity: number;
  coverage: number;
}

const BAND_MAP: Record<string, number> = {
  neck: 0.18,
  waist: 0.48,
  hip: 0.62,
};

function ensureCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Canvas unavailable");
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
    throw new Error("Browser APIs unavailable");
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
  if (!ctx) throw new Error("Canvas context unavailable");
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

function extractBands(image: LoadedImage): SilhouetteBands {
  const { width, height, data } = image;
  const pixels = data.data;
  const rowLeft = new Array<number>(height).fill(width);
  const rowRight = new Array<number>(height).fill(-1);
  let subjectTop = height;
  let subjectBottom = 0;
  let subjectPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = luminance(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
      if (lum < 235) {
        subjectPixels += 1;
        if (rowLeft[y] > x) rowLeft[y] = x;
        if (rowRight[y] < x) rowRight[y] = x;
        if (subjectTop > y) subjectTop = y;
        if (subjectBottom < y) subjectBottom = y;
      }
    }
  }

  const bodyHeight = Math.max(subjectBottom - subjectTop, 0);
  const bandWidths: Record<string, BandMetrics> = {};

  for (const [band, ratio] of Object.entries(BAND_MAP)) {
    const y = Math.min(height - 1, Math.max(0, Math.round(subjectTop + bodyHeight * ratio)));
    const left = rowLeft[y];
    const right = rowRight[y];
    bandWidths[band] = {
      ratio,
      widthPx: left >= right || left === width || right < 0 ? 0 : right - left,
    };
  }

  const coverage = subjectPixels / (width * height);
  const clarity = Math.min(1, laplacianVariance(image.data) / 25);

  return { subjectHeightPx: bodyHeight, bandWidths, clarity, coverage };
}

function ellipseCircumference(aCm: number, bCm: number) {
  if (!Number.isFinite(aCm) || !Number.isFinite(bCm) || aCm <= 0 || bCm <= 0) return NaN;
  const a = Math.max(aCm, bCm);
  const b = Math.min(aCm, bCm);
  const h = Math.pow((a - b) / (a + b), 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function average(values: number[]) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return NaN;
  return finite.reduce((acc, value) => acc + value, 0) / finite.length;
}

export async function estimateCircumferences(input: PhotoInputs) {
  const qc: string[] = [];
  const { mode, front, side, back, left, right, heightCm } = input;
  if (!heightCm || heightCm < 120) {
    return { confidence: 0, qc: ["missing_height"] } as const;
  }

  const images: Record<string, SilhouetteBands | null> = {
    front: null,
    side: null,
    back: null,
    left: null,
    right: null,
  };

  try {
    images.front = extractBands(await loadImageData(front));
    images.side = extractBands(await loadImageData(side));
    if (mode === "4") {
      if (back) images.back = extractBands(await loadImageData(back));
      if (left) images.left = extractBands(await loadImageData(left));
      if (right) images.right = extractBands(await loadImageData(right));
    }
  } catch (error) {
    qc.push("image_load_failed");
    return { confidence: 0, qc } as const;
  }

  const frontBands = images.front;
  const sideBands = images.side;
  if (!frontBands || !sideBands) {
    qc.push("insufficient_images");
    return { confidence: 0, qc } as const;
  }

  const scaleFront = frontBands.subjectHeightPx / heightCm;
  const scaleSide = sideBands.subjectHeightPx / heightCm;
  if (!Number.isFinite(scaleFront) || scaleFront < 3) {
    qc.push("front_scale_unreliable");
  }
  if (!Number.isFinite(scaleSide) || scaleSide < 3) {
    qc.push("side_scale_unreliable");
  }

  const pixelsToCm = (widthPx: number, scale: number) =>
    !Number.isFinite(scale) || scale <= 0 ? NaN : widthPx / scale;

  const computeBand = (band: keyof typeof BAND_MAP) => {
    const frontWidth = pixelsToCm(frontBands.bandWidths[band].widthPx, scaleFront);
    const backWidth = images.back ? pixelsToCm(images.back.bandWidths[band].widthPx, images.back.subjectHeightPx / heightCm) : NaN;
    const sideWidth = pixelsToCm(sideBands.bandWidths[band].widthPx, scaleSide);
    const lateral: number[] = [sideWidth];
    if (mode === "4") {
      if (images.left) lateral.push(pixelsToCm(images.left.bandWidths[band].widthPx, images.left.subjectHeightPx / heightCm));
      if (images.right) lateral.push(pixelsToCm(images.right.bandWidths[band].widthPx, images.right.subjectHeightPx / heightCm));
    }
    const frontAvg = average([frontWidth, backWidth]);
    const sideAvg = average(lateral);
    const circumference = ellipseCircumference(frontAvg / 2, sideAvg / 2);
    return {
      circumference,
      frontWidth: frontAvg,
      sideWidth: sideAvg,
    };
  };

  const neck = computeBand("neck");
  const waist = computeBand("waist");
  const hip = computeBand("hip");

  const qcBands = [
    { name: "neck", value: neck },
    { name: "waist", value: waist },
    { name: "hip", value: hip },
  ];

  let confidence = 0.7;
  const clarityScores = [frontBands.clarity, sideBands.clarity];
  if (images.back) clarityScores.push(images.back.clarity);
  if (images.left) clarityScores.push(images.left.clarity);
  if (images.right) clarityScores.push(images.right.clarity);
  const clarityAvg = average(clarityScores);
  if (Number.isFinite(clarityAvg)) {
    confidence = Math.min(0.95, Math.max(0.4, clarityAvg * 0.9 + 0.3));
  }

  for (const band of qcBands) {
    if (!Number.isFinite(band.value.circumference)) {
      qc.push(`${band.name}_unreliable`);
      confidence -= 0.12;
    } else {
      const circumference = band.value.circumference as number;
      if (circumference < 30 || circumference > 180) {
        qc.push(`${band.name}_out_of_range`);
        confidence -= 0.1;
      }
      const widthSpread = Math.abs((band.value.frontWidth ?? 0) - (band.value.sideWidth ?? 0));
      if (Number.isFinite(widthSpread) && widthSpread > 10) {
        confidence -= 0.05;
        qc.push(`${band.name}_variance_high`);
      }
    }
  }

  if (frontBands.coverage < 0.18 || sideBands.coverage < 0.18) {
    qc.push("subject_too_small");
    confidence -= 0.1;
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    neckCm: Number.isFinite(neck.circumference) ? Number((neck.circumference as number).toFixed(1)) : undefined,
    waistCm: Number.isFinite(waist.circumference) ? Number((waist.circumference as number).toFixed(1)) : undefined,
    hipCm: Number.isFinite(hip.circumference) ? Number((hip.circumference as number).toFixed(1)) : undefined,
    confidence,
    qc,
  };
}
