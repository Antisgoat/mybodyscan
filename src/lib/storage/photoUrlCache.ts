import { getDownloadURL, ref, type FirebaseStorage } from "firebase/storage";

type CacheEntry = { promise: Promise<string>; expiresAt: number };

const TTL_MS = 30 * 60 * 1000;
const photoUrlCache = new Map<string, CacheEntry>();

export async function getCachedScanPhotoUrl(
  storage: FirebaseStorage,
  path: string,
  cacheKey?: string,
  ttlMs: number = TTL_MS
): Promise<string> {
  const key = cacheKey || path;
  const now = Date.now();
  const existing = photoUrlCache.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  if (existing) {
    photoUrlCache.delete(key);
  }

  const promise = getDownloadURL(ref(storage, path))
    .then((url) => url)
    .catch((err) => {
      photoUrlCache.delete(key);
      throw err;
    });
  photoUrlCache.set(key, { promise, expiresAt: now + Math.max(1_000, ttlMs) });
  return promise;
}

export function clearCachedScanPhotoUrl(cacheKey: string): void {
  photoUrlCache.delete(cacheKey);
}

export function resetScanPhotoUrlCache(): void {
  photoUrlCache.clear();
}
