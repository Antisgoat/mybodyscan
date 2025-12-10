import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { auth } from "@/lib/firebase";

export async function getFrontThumbUrl(scanId: string): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const storage = getStorage();
  const modernPath = `user_uploads/${uid}/${scanId}/front.jpg`;
  const legacyPath = `scans/${uid}/${scanId}/original/front.jpg`;
  try {
    return await getDownloadURL(ref(storage, modernPath));
  } catch {
    try {
      return await getDownloadURL(ref(storage, legacyPath));
    } catch {
      return null;
    }
  }
}
