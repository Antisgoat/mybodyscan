import { getDownloadURL, ref, type FirebaseStorage } from "firebase/storage";

const photoUrlCache = new Map<string, Promise<string>>();

export async function getCachedScanPhotoUrl(
  storage: FirebaseStorage,
  path: string,
  cacheKey?: string
): Promise<string> {
  const key = cacheKey || path;
  const existing = photoUrlCache.get(key);
  if (existing) return existing;

  const promise = getDownloadURL(ref(storage, path))
    .then((url) => url)
    .catch((err) => {
      photoUrlCache.delete(key);
      throw err;
    });
  photoUrlCache.set(key, promise);
  return promise;
}

export function clearCachedScanPhotoUrl(cacheKey: string): void {
  photoUrlCache.delete(cacheKey);
}

export function resetScanPhotoUrlCache(): void {
  photoUrlCache.clear();
}
