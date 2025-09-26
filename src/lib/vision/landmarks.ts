export type PoseQuality = {
  /** The view orientation reported by the caller (e.g. "front" or "side"). */
  view: string;
  /** True when the stub believes the image is too blurry for reliable landmarks. */
  isBlurry: boolean;
  /** True when major body parts might be obstructed. */
  isOccluded: boolean;
  /** Simple heuristic indicating whether the subject appears centered. */
  isCentered: boolean;
  /** Lighting heuristic on a 0-1 scale where higher is better. */
  lightingScore: number;
  /** Pose heuristic on a 0-1 scale where higher is better. */
  poseScore: number;
};

export type Landmarks = {
  /** The input view for these landmarks. */
  view: string;
  /** Image width in pixels. */
  imageWidth: number;
  /** Image height in pixels. */
  imageHeight: number;
  /** Estimated waist width in pixels. */
  waistWidth: number;
  /** Estimated hip width in pixels. */
  hipWidth: number;
  /** Estimated neck width in pixels. */
  neckWidth: number;
  /** Estimated standing height in pixels. */
  heightPixels: number;
  /** Pose and quality heuristics. */
  quality: PoseQuality;
};

const DEFAULT_DIMENSION = 512;

async function resolveDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width || DEFAULT_DIMENSION, height: bitmap.height || DEFAULT_DIMENSION };
      bitmap.close?.();
      return dimensions;
    } catch (error) {
      // Ignore and fall through to other strategies.
    }
  }

  if (typeof Image !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      const url = URL.createObjectURL(blob);
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            width: img.naturalWidth || img.width || DEFAULT_DIMENSION,
            height: img.naturalHeight || img.height || DEFAULT_DIMENSION,
          });
        };
        img.onerror = (event) => reject(event);
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return dimensions;
    } catch (error) {
      // Ignore and fall back to deterministic default.
    }
  }

  // Deterministic fallback based solely on the blob size.
  const size = blob.size || DEFAULT_DIMENSION * DEFAULT_DIMENSION;
  const square = Math.max(1, Math.round(Math.sqrt(size)));
  return { width: square, height: square };
}

function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function analyzePhoto(blob: Blob, view: string): Promise<Landmarks> {
  const { width, height } = await resolveDimensions(blob);
  const aspectRatio = height === 0 ? 1 : width / height;
  const normalizedAspect = clamp01(1 - Math.abs(aspectRatio - 0.6));

  const waistWidth = round(width * 0.45, 2);
  const hipWidth = round(width * 0.55, 2);
  const neckWidth = round(width * 0.22, 2);
  const heightPixels = round(height * 0.95, 2);

  const lightingScore = round(0.5 + normalizedAspect * 0.4);
  const poseScore = round(0.55 + normalizedAspect * 0.35);
  const isCentered = normalizedAspect > 0.25;

  const quality: PoseQuality = {
    view,
    isBlurry: false,
    isOccluded: false,
    isCentered,
    lightingScore,
    poseScore,
  };

  return {
    view,
    imageWidth: width,
    imageHeight: height,
    waistWidth,
    hipWidth,
    neckWidth,
    heightPixels,
    quality,
  };
}
