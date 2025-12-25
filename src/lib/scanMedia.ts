import { auth } from "@/lib/firebase";

export type ScanPose = "front" | "back" | "left" | "right";

export function revokeBlobUrl(url: string | null | undefined): void {
  if (typeof url !== "string") return;
  if (!url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

export async function fetchScanPhotoBlobUrl(params: {
  scanId: string;
  pose: ScanPose;
}): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken(false).catch(() => "");
  if (!token) return null;
  const url = `/api/scan/photo?${new URLSearchParams({
    scanId: params.scanId,
    pose: params.pose,
  }).toString()}`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      // Don’t persist cookies; auth is via header.
      credentials: "omit",
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob || blob.size <= 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  return await fetchScanPhotoBlobUrl({ scanId, pose: "front" });
}
