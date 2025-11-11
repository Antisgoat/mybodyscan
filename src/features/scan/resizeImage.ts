// Resize to reduce upload size; apply EXIF orientation if the browser supports it.
// No external deps; graceful fallback to raw file.
export async function resizeImageFile(
  file: File,
  maxW = 1600,
  quality = 0.9
): Promise<Blob> {
  try {
    const bitmap = await (window.createImageBitmap
      ? window.createImageBitmap(file, { imageOrientation: "from-image" as any })
      : null);
    const imgEl = bitmap ? null : await fileToImage(file); // fallback

    const w = bitmap ? bitmap.width : (imgEl as HTMLImageElement).naturalWidth;
    const h = bitmap ? bitmap.height : (imgEl as HTMLImageElement).naturalHeight;

    const scale = Math.min(1, maxW / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, outW, outH);
    } else {
      ctx.drawImage(imgEl as HTMLImageElement, 0, 0, outW, outH);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    return blob ?? file;
  } catch {
    return file; // worst-case: keep original
  }
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
