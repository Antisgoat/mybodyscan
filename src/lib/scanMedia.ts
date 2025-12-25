import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { reportError } from "@/lib/telemetry";

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const storage = getStorage();
  const candidates = [
    // Canonical (current)
    `scans/${uid}/${scanId}/front.jpg`,
    // Legacy canonical without /scans segment.
    `user_uploads/${uid}/${scanId}/front.jpg`,
    // Legacy canonical under user_uploads/{uid}/scans/...
    `user_uploads/${uid}/scans/${scanId}/front.jpg`,
    // Legacy paths observed in older builds / storage migrations.
    `scans/${uid}/${scanId}/original/front.jpg`,
  ];
  for (const path of candidates) {
    try {
      return await getDownloadURL(ref(storage, path));
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
