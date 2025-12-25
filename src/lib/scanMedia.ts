import { auth } from "@/lib/firebase";

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  // Same-origin endpoint (Hosting rewrite → Function) so the browser never calls
  // `firebasestorage.googleapis.com` directly.
  return `/api/scan/photo?${new URLSearchParams({ scanId, pose: "front" }).toString()}`;
}
