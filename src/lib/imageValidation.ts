const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/pjpeg", "image/png"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export const MIN_IMAGE_DIMENSION = 640;

export function isAllowedImageType(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(type)) return true;
  const name = file.name?.toLowerCase?.() ?? "";
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}
