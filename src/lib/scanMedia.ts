import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { auth } from "@/lib/firebase";

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = auth?.currentUser?.uid ?? null;
  if (!uid) return null;
  const storage = getStorage();
  const path = `scans/${uid}/${scanId}/original/front.jpg`;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}
