import { getDownloadURL, ref, type FirebaseStorage } from "firebase/storage";

type OkEntry = { kind: "ok"; promise: Promise<string>; expiresAt: number };
type PendingEntry = { kind: "pending"; promise: Promise<string>; startedAt: number };
type MissEntry = {
  kind: "miss";
  nextRetryAt: number;
  attempts: number;
  lastErrorCode?: string;
  lastHttpStatus?: number;
};

type CacheEntry = OkEntry | PendingEntry | MissEntry;

const TTL_MS = 30 * 60 * 1000;
const MISS_BASE_DELAY_MS = 1_250;
const MISS_MAX_DELAY_MS = 20_000;
const photoUrlCache = new Map<string, CacheEntry>();

export type CachedPhotoUrlOutcome = {
  url: string | null;
  nextRetryAt?: number;
  errorCode?: string;
  httpStatus?: number;
};

function parseHttpStatusFromStorageError(err: any): number | undefined {
  const direct =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.httpStatus === "number"
        ? err.httpStatus
        : typeof err?.statusCode === "number"
          ? err.statusCode
          : undefined;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const serverResponse =
    typeof err?.customData?.serverResponse === "string"
      ? err.customData.serverResponse
      : typeof err?.serverResponse === "string"
        ? err.serverResponse
        : null;
  if (!serverResponse) return undefined;
  try {
    const parsed = JSON.parse(serverResponse);
    const code =
      typeof parsed?.error?.code === "number"
        ? parsed.error.code
        : typeof parsed?.code === "number"
          ? parsed.code
          : undefined;
    return typeof code === "number" && Number.isFinite(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function normalizeErrorCode(err: any): string | undefined {
  const code = err?.code;
  if (typeof code === "string" && code.trim()) return code.trim();
  const name = err?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return undefined;
}

function computeBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt || 1));
  const pow = Math.min(6, n - 1);
  const base = Math.min(MISS_MAX_DELAY_MS, MISS_BASE_DELAY_MS * Math.pow(2, pow));
  const jitter = 0.75 + Math.random() * 0.5; // 0.75–1.25
  return Math.max(750, Math.round(base * jitter));
}

export async function getCachedScanPhotoUrlMaybe(
  storage: FirebaseStorage,
  path: string,
  cacheKey?: string,
  options?: {
    okTtlMs?: number;
    nowMs?: number;
  }
): Promise<CachedPhotoUrlOutcome> {
  const key = cacheKey || path;
  const now =
    typeof options?.nowMs === "number" && Number.isFinite(options.nowMs)
      ? options.nowMs
      : Date.now();
  const existing = photoUrlCache.get(key);
  if (existing?.kind === "ok" && existing.expiresAt > now) {
    return { url: await existing.promise };
  }
  if (existing?.kind === "pending") {
    try {
      return { url: await existing.promise };
    } catch (err: any) {
      const errorCode = normalizeErrorCode(err);
      const httpStatus = parseHttpStatusFromStorageError(err);
      // If a pending entry failed, fall through and compute miss/backoff below.
      const attempt = 1;
      const retryIn = computeBackoffMs(attempt);
      const nextRetryAt = now + retryIn;
      photoUrlCache.set(key, {
        kind: "miss",
        nextRetryAt,
        attempts: attempt,
        lastErrorCode: errorCode,
        lastHttpStatus: httpStatus,
      });
      return { url: null, nextRetryAt, errorCode, httpStatus };
    }
  }
  if (existing?.kind === "miss" && existing.nextRetryAt > now) {
    return {
      url: null,
      nextRetryAt: existing.nextRetryAt,
      errorCode: existing.lastErrorCode,
      httpStatus: existing.lastHttpStatus,
    };
  }

  const okTtlMs = Math.max(1_000, options?.okTtlMs ?? TTL_MS);
  const startedAt = now;
  const downloadPromise = getDownloadURL(ref(storage, path));
  photoUrlCache.set(key, { kind: "pending", promise: downloadPromise, startedAt });
  try {
    const url = await downloadPromise;
    // Store a resolved promise so callers can await consistently.
    photoUrlCache.set(key, {
      kind: "ok",
      promise: Promise.resolve(url),
      expiresAt: startedAt + okTtlMs,
    });
    return { url };
  } catch (err: any) {
    const errorCode = normalizeErrorCode(err);
    const httpStatus = parseHttpStatusFromStorageError(err);
    const prevAttempts = existing?.kind === "miss" ? existing.attempts : 0;
    const attempts = Math.max(1, prevAttempts + 1);
    const retryIn = computeBackoffMs(attempts);
    const nextRetryAt = now + retryIn;
    photoUrlCache.set(key, {
      kind: "miss",
      nextRetryAt,
      attempts,
      lastErrorCode: errorCode,
      lastHttpStatus: httpStatus,
    });
    return { url: null, nextRetryAt, errorCode, httpStatus };
  }
}

export async function getCachedScanPhotoUrl(
  storage: FirebaseStorage,
  path: string,
  cacheKey?: string,
  ttlMs: number = TTL_MS
): Promise<string> {
  const outcome = await getCachedScanPhotoUrlMaybe(storage, path, cacheKey, {
    okTtlMs: ttlMs,
  });
  if (outcome.url) return outcome.url;
  const err: any = new Error("Scan photo URL not ready yet.");
  err.code = outcome.errorCode || "storage/url_not_ready";
  err.httpStatus = outcome.httpStatus;
  err.nextRetryAt = outcome.nextRetryAt;
  throw err;
}

export function clearCachedScanPhotoUrl(cacheKey: string): void {
  photoUrlCache.delete(cacheKey);
}

export function resetScanPhotoUrlCache(): void {
  photoUrlCache.clear();
}
