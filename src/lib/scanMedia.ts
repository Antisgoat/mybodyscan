import { getStorage } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { reportError } from "@/lib/telemetry";
import { getScanPhotoPath } from "@/lib/scanPaths";
import { getCachedScanPhotoUrl } from "@/lib/storage/photoUrlCache";

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const storage = getStorage();
  const candidates = [getScanPhotoPath(uid, scanId, "front")];
  for (const path of candidates) {
    try {
      return await getCachedScanPhotoUrl(storage, path, `${scanId}:front`);
    } catch {
      // continue
    }
  }
  void reportError({
    kind: "scan_thumb_missing",
    message: "Unable to resolve scan thumbnail",
    extra: { scanId, candidates },
  });
  return null;
}
