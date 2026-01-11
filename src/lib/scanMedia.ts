import { getStorage } from "firebase/storage";
import { getCachedUser } from "@/auth/client";
import { reportError } from "@/lib/telemetry";
import { getScanPhotoPath } from "@/lib/scanPaths";
import { getCachedScanPhotoUrlMaybe } from "@/lib/storage/photoUrlCache";

const THUMB_REPORT_TTL_MS = 5 * 60 * 1000;
const lastThumbReportAt = new Map<string, number>();

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = getCachedUser()?.uid;
  if (!uid) return null;
  const storage = getStorage();
  const candidates = [getScanPhotoPath(uid, scanId, "front")];
  for (const path of candidates) {
    try {
      const outcome = await getCachedScanPhotoUrlMaybe(storage, path, `${scanId}:front`);
      if (outcome.url) return outcome.url;
    } catch {
      // continue
    }
  }
  // Avoid telemetry spam: thumbnails are fetched often in list UIs.
  const now = Date.now();
  const last = lastThumbReportAt.get(scanId) ?? 0;
  if (now - last > THUMB_REPORT_TTL_MS) {
    lastThumbReportAt.set(scanId, now);
    void reportError({
      kind: "scan_thumb_missing",
      message: "Unable to resolve scan thumbnail",
      extra: { scanId, candidates },
    });
  }
  return null;
}
